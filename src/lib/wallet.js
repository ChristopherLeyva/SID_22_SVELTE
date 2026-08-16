// src/lib/wallet.js
//
// Servicio de conexión a wallet (SOLO Pali Wallet) usando ethers.js v6.
//
// MetaMask, Pali y otras wallets compiten por exponer su proveedor EVM en
// `window.ethereum`. Para garantizar que la dApp se conecte EXCLUSIVAMENTE
// con Pali Wallet usamos el mecanismo estándar EIP-6963: Pali anuncia su
// proveedor con el nombre/rdns "pali", así nunca usamos el proveedor de
// MetaMask. Como marcador adicional de instalación, Pali también inyecta
// `window.pali` (proveedor UTXO/Syscoin) que ninguna otra wallet expone.
//
// Documentación oficial: https://docs.paliwallet.com/docs/developers/provider-discovery

import { BrowserProvider, formatEther, formatUnits } from "ethers";

// Ethers v6 solo tiene nombre hardcodeado para unas pocas redes; para el
// resto devuelve "unknown". Este mapa resuelve el nombre amigable del chainId.
const CHAIN_NAMES = {
  1: "Ethereum Mainnet",
  5: "Goerli Testnet",
  11155111: "Sepolia Testnet",
  17000: "Holesky Testnet",
  560048: "Hoodi Testnet",
  57: "Syscoin Mainnet",
  5700: "Syscoin Testnet",
  570: "Rollux Mainnet",
  57000: "Rollux Testnet",
};

// Exploradores de bloque por chainId (base sin barra final).
const EXPLORERS = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  17000: "https://holesky.etherscan.io",
  560048: "https://hoodi.etherscan.io",
  57: "https://syscoin.blockscout.com",
  570: "https://explorer.rollux.com",
};

/**
 * Descubre el proveedor EVM de Pali Wallet mediante EIP-6963.
 * Devuelve el proveedor de Pali o null si Pali no está instalada/habilitada.
 */
export async function detectPaliProvider(timeoutMs = 300) {
  if (typeof window === "undefined") return null;

  const providers = [];

  function onProvider(event) {
    providers.push(event.detail);
  }

  window.addEventListener("eip6963:announceProvider", onProvider);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  window.removeEventListener("eip6963:announceProvider", onProvider);

  const match = providers.find(({ info }) => {
    const name = String(info.name || "").toLowerCase();
    const rdns = String(info.rdns || "").toLowerCase();
    return name.includes("pali") || rdns.includes("pali");
  });

  return match?.provider ?? null;
}

/**
 * Verifica si Pali Wallet está instalada/habilitada en el navegador.
 */
export async function hasInjectedProvider() {
  const pali = await detectPaliProvider();
  if (pali) return true;
  // `window.pali` (proveedor UTXO) solo lo inyecta Pali: confirma instalación.
  return typeof window !== "undefined" && typeof window["pali"] !== "undefined";
}

/**
 * Obtiene el proveedor EIP-1193 de Pali. Lanza error claro si Pali no está.
 */
async function getPaliProvider() {
  const pali = await detectPaliProvider();
  if (pali) return pali;

  // Versiones antiguas de Pali sin EIP-6963: si Pali está instalada
  // (marcador `window.pali` presente), usamos su provider de `window.ethereum`.
  if (
    typeof window !== "undefined" &&
    typeof window["pali"] !== "undefined" &&
    typeof window["ethereum"] !== "undefined"
  ) {
    return window["ethereum"];
  }

  throw new Error(
    "No se detectó Pali Wallet. Instala y habilita la extensión de Pali Wallet y recarga la página."
  );
}

/**
 * Solicita conexión a Pali Wallet (abre el popup de Pali pidiendo autorización),
 * y devuelve el proveedor, el signer y la dirección conectada.
 */
export async function connectWallet() {
  const provider = new BrowserProvider(await getPaliProvider());

  // eth_requestAccounts dispara el popup de Pali pidiendo al usuario que
  // autorice la conexión del sitio. Si el usuario ya autorizó antes,
  // puede resolver sin mostrar el popup.
  await provider.send("eth_requestAccounts", []);

  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, signer, address };
}

/**
 * Lee el saldo nativo (ej. ETH, SYS, etc. según la red activa en Pali)
 * de una dirección, ya formateado de wei a unidades legibles.
 */
export async function getBalance(provider, address) {
  const balanceWei = await provider.getBalance(address);
  return formatEther(balanceWei);
}

/**
 * Lee la red/cadena activa en Pali (útil para mostrarla en la UI).
 */
export async function getNetwork(provider) {
  const network = await provider.getNetwork();
  const chainId = network.chainId.toString();
  return {
    chainId,
    name: CHAIN_NAMES[chainId] ?? network.name,
  };
}

/**
 * Lee métricas del bloque más reciente: número, precio de gas y base fee.
 */
export async function getBlockInfo(provider) {
  const [block, feeData] = await Promise.all([
    provider.getBlock("latest"),
    provider.getFeeData(),
  ]);
  return {
    number: block?.number ?? null,
    gasPriceGwei: feeData?.gasPrice
      ? Number(formatUnits(feeData.gasPrice, "gwei")).toFixed(2)
      : null,
    baseFeeGwei: block?.baseFeePerGas
      ? Number(formatUnits(block.baseFeePerGas, "gwei")).toFixed(2)
      : null,
  };
}

/**
 * Construye URL de explorador para una dirección o tx, o null si no se
 * conoce el explorador de esa red.
 */
export function getExplorerUrl(chainId, type, value) {
  const base = EXPLORERS[chainId];
  if (!base) return null;
  return `${base}/${type}/${value}`;
}

/**
 * Estima el gas necesario para transferir `amountWei` a `to`.
 */
export async function estimateTransfer(signer, to, amountWei) {
  return signer.estimateGas({ to, value: amountWei });
}

/**
 * Envía una transferencia nativa (ETH/SYS) y devuelve el hash de la tx.
 */
export async function sendNative(signer, to, amountWei) {
  const tx = await signer.sendTransaction({ to, value: amountWei });
  return tx.hash;
}

/**
 * Firma un mensaje con la cuenta de Pali (método personal_sign → EIP-191).
 */
export async function signMessage(signer, message) {
  return signer.signMessage(message);
}

/**
 * Suscribe callbacks a los eventos estándar EIP-1193 que Pali emite:
 * cambio de cuenta activa y cambio de red.
 */
export function subscribeToWalletEvents({ onAccountsChanged, onChainChanged }) {
  let provider = null;

  async function init() {
    try {
      provider = await getPaliProvider();
    } catch {
      return;
    }
    if (onAccountsChanged) provider.on("accountsChanged", onAccountsChanged);
    if (onChainChanged) provider.on("chainChanged", onChainChanged);
  }

  init();

  // función de limpieza, para usar en onDestroy() del componente Svelte
  return () => {
    if (provider) {
      if (onAccountsChanged) provider.removeListener("accountsChanged", onAccountsChanged);
      if (onChainChanged) provider.removeListener("chainChanged", onChainChanged);
    }
  };
}