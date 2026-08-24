 import { BrowserProvider, JsonRpcProvider, formatEther, formatUnits } from "ethers";

export const CHAIN_NAMES = {
  1: "Ethereum Mainnet",
  5: "Goerli Testnet",
  11155111: "Sepolia Testnet",
  17000: "Holesky Testnet",
  560048: "Hoodi Testnet",
  57: "Syscoin Mainnet",
  5700: "Syscoin Testnet",
  570: "Rollux Mainnet",
  57000: "Rollux Testnet",
  5701: "zkSYS Testnet",
  57057: "zkSYS Genesis Testnet",
};

// --- EVM Networks categorizables por saldo ---
// Cada entrada es una red EVM con su RPC público. Puedes añadir/editar RPCs propias.
// `rpcUrl` es el primario (compatibilidad), `rpcUrls` lista de fallbacks probados secuencialmente.
// Se priorizan endpoints con CORS habilitado para funcionar directo desde el navegador.
export const EVM_NETWORKS = [
  {
    chainId: "1",
    name: "Ethereum Mainnet",
    symbol: "ETH",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    rpcUrls: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com", "https://1rpc.io/eth"],
    explorer: "https://etherscan.io",
  },
  {
    chainId: "11155111",
    name: "Sepolia Testnet",
    symbol: "ETH",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.drpc.org", "https://1rpc.io/sepolia"],
    explorer: "https://sepolia.etherscan.io",
  },
  {
    chainId: "17000",
    name: "Holesky Testnet",
    symbol: "ETH",
    // publicnode.com devuelve 403 "unsupported platform" en Holesky → usar ethpandaops/meowrpc
    rpcUrl: "https://rpc.holesky.ethpandaops.io",
    rpcUrls: ["https://rpc.holesky.ethpandaops.io", "https://holesky.meowrpc.com", "https://1rpc.io/holesky"],
    explorer: "https://holesky.etherscan.io",
  },
  {
    chainId: "560048",
    name: "Hoodi Testnet",
    symbol: "ETH",
    rpcUrl: "https://rpc.hoodi.ethpandaops.io",
    rpcUrls: ["https://rpc.hoodi.ethpandaops.io"],
    explorer: "https://hoodi.etherscan.io",
  },
  {
    chainId: "57",
    name: "Syscoin Mainnet",
    symbol: "SYS",
    rpcUrl: "https://rpc.syscoin.org",
    rpcUrls: ["https://rpc.syscoin.org", "https://syscoin-evm.publicnode.com", "https://syscoin-mainnet.publicnode.com"],
    explorer: "https://syscoin.blockscout.com",
  },
  {
    chainId: "570",
    name: "Rollux Mainnet",
    symbol: "SYS",
    rpcUrl: "https://rpc.rollux.com",
    rpcUrls: ["https://rpc.rollux.com", "https://rollux.publicnode.com", "https://rollux-evm.publicnode.com"],
    explorer: "https://explorer.rollux.com",
  },
  {
    chainId: "5700",
    name: "Syscoin Testnet",
    symbol: "tSYS",
    rpcUrl: "https://rpc.tanenbaum.io",
    rpcUrls: ["https://rpc.tanenbaum.io", "https://syscoin-tanenbaum-evm.publicnode.com"],
    explorer: "https://tanenbaum.io",
  },
  {
    chainId: "57000",
    name: "Rollux Testnet",
    symbol: "tSYS",
    rpcUrl: "https://rpc-tanenbaum.rollux.com",
    rpcUrls: ["https://rpc-tanenbaum.rollux.com", "https://rollux-tanenbaum-evm.publicnode.com"],
    explorer: "https://rollux.tanenbaum.io",
  },
  {
    chainId: "5701",
    name: "zkSYS Testnet",
    symbol: "tSYS",
    rpcUrl: "https://rpc-test-zk.syscoin.org",
    rpcUrls: ["https://rpc-test-zk.syscoin.org", "https://rpc-zk.tanenbaum.io"],
    explorer: "https://explorer-test-zk.syscoin.org",
  },
  {
    chainId: "57057",
    name: "zkSYS Genesis Testnet",
    symbol: "SYS",
    rpcUrl: "https://rpc-zk.tanenbaum.io",
    rpcUrls: ["https://rpc-zk.tanenbaum.io", "https://rpc-test-zk.syscoin.org"],
    explorer: "https://explorer-zk.tanenbaum.io",
  },
];

const EXPLORERS = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  17000: "https://holesky.etherscan.io",
  560048: "https://hoodi.etherscan.io",
  57: "https://syscoin.blockscout.com",
  570: "https://explorer.rollux.com",
  5701: "https://explorer-test-zk.syscoin.org",
  57057: "https://explorer-zk.tanenbaum.io",
};

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

export async function hasInjectedProvider() {
  const pali = await detectPaliProvider();
  if (pali) return true;
  return typeof window !== "undefined" && typeof window["pali"] !== "undefined";
}

export async function getPaliProvider() {
  const pali = await detectPaliProvider();
  if (pali) return pali;

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

function toHexChainId(chainId) {
  return "0x" + BigInt(chainId).toString(16);
}

/**
 * Cambia de red desde la UI sin abrir Pali manualmente.
 * Intenta `wallet_switchEthereumChain` y si la red no está agregada (4902) la añade con `wallet_addEthereumChain`.
 * @param {string|number} targetChainId - chainId decimal como string o number
 */
export async function switchNetwork(targetChainId) {
  const chainIdStr = String(targetChainId);
  const hexChainId = toHexChainId(chainIdStr);
  const injected = await getPaliProvider();

  try {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
    return hexChainId;
  } catch (err) {
    // 4902 = chain no agregada, -32603 a veces lo envuelve, 4001 = rechazo usuario
    const code = err?.code;
    const msg = String(err?.message || "");
    const needsAdd = code === 4902 || code === -32603 || msg.toLowerCase().includes("unrecognized") || msg.includes("not added") || msg.includes("no added");
    if (!needsAdd) throw err;

    const net = EVM_NETWORKS.find((n) => n.chainId === chainIdStr);
    if (!net) throw new Error(`Red ${chainIdStr} no configurada en EVM_NETWORKS`);

    const urls = net.rpcUrls?.length ? net.rpcUrls : [net.rpcUrl];
    const addParams = {
      chainId: hexChainId,
      chainName: net.name,
      nativeCurrency: { name: net.symbol, symbol: net.symbol, decimals: 18 },
      rpcUrls: urls,
      blockExplorerUrls: net.explorer ? [net.explorer] : [],
    };

    await injected.request({
      method: "wallet_addEthereumChain",
      params: [addParams],
    });
    return hexChainId;
  }
}

export async function connectWallet() {
  const provider = new BrowserProvider(await getPaliProvider());

  await provider.send("eth_requestAccounts", []);

  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, signer, address };
}

export async function getBalance(provider, address) {
  const balanceWei = await provider.getBalance(address);
  return formatEther(balanceWei);
}

export async function getNetwork(provider) {
  const network = await provider.getNetwork();
  const chainId = network.chainId.toString();
  return {
    chainId,
    name: CHAIN_NAMES[chainId] ?? network.name,
  };
}

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

export function getExplorerUrl(chainId, type, value) {
  const base = EXPLORERS[chainId];
  if (!base) return null;
  return `${base}/${type}/${value}`;
}

export async function estimateTransfer(signer, to, amountWei) {
  return signer.estimateGas({ to, value: amountWei });
}

export async function sendNative(signer, to, amountWei) {
  const tx = await signer.sendTransaction({ to, value: amountWei });
  return tx.hash;
}

export async function signMessage(signer, message) {
  return signer.signMessage(message);
}

/**
 * Ordena un array de redes con saldo de mayor a menor.
 * Espera objetos con `balanceWei` (bigint). No muta el array original.
 * @param {Array<{balanceWei: bigint}>} networks
 * @returns {Array} copia ordenada descendente
 */
export function sortNetworksByBalance(networks) {
  return [...networks].sort((a, b) => {
    const av = typeof a.balanceWei === "bigint" ? a.balanceWei : BigInt(a.balanceWei ?? 0);
    const bv = typeof b.balanceWei === "bigint" ? b.balanceWei : BigInt(b.balanceWei ?? 0);
    if (bv > av) return 1;
    if (bv < av) return -1;
    return 0;
  });
}

/**
 * Categoriza redes por nivel de saldo (útil para filtros visuales).
 * @param {Array} sortedNetworks - ya ordenadas de mayor a menor
 * @returns {{ alto: Array, medio: Array, bajo: Array, sinFondos: Array }}
 */
export function categorizeByBalance(sortedNetworks) {
  const alto = [];
  const medio = [];
  const bajo = [];
  const sinFondos = [];
  for (const n of sortedNetworks) {
    const bal = Number(n.balance ?? n.balanceFormatted ?? 0);
    if (bal === 0) sinFondos.push(n);
    else if (bal >= 1) alto.push(n);
    else if (bal >= 0.1) medio.push(n);
    else bajo.push(n);
  }
  return { alto, medio, bajo, sinFondos };
}

function formatRpcError(e) {
  const raw = String(e?.message ?? e ?? "RPC_ERROR");
  // Acorta errores verbosos de ethers (server response 403..., Failed to fetch)
  if (raw.includes("Failed to fetch")) return "RPC no disponible (Failed to fetch / CORS)";
  if (raw.includes("TIMEOUT_RPC")) return "Timeout RPC";
  if (raw.includes("unsupported platform") || raw.includes("403")) return "RPC 403 · endpoint no soportado";
  if (raw.includes("could not detect network")) return "Red no detectada";
  if (raw.includes("NETWORK_ERROR")) return "Error de red";
  if (raw.length > 90) return raw.slice(0, 90) + "…";
  return raw;
}

/**
 * Intenta obtener balance probando varios rpcUrls secuencialmente con timeout.
 */
async function tryGetBalanceWithFallback(rpcUrls, address, timeoutMs) {
  const withTimeout = (promise, ms) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT_RPC")), ms)),
    ]);
  let lastError = null;
  for (const url of rpcUrls) {
    try {
      const provider = new JsonRpcProvider(url);
      const bal = await withTimeout(provider.getBalance(address), timeoutMs);
      return { balWei: bal, url, error: null };
    } catch (e) {
      lastError = e;
      const msg = String(e?.message ?? "");
      // Si es 403 / unsupported platform, probar siguiente RPC inmediatamente
      const shouldTryNext = msg.includes("403") || msg.includes("unsupported platform") || msg.includes("Failed to fetch") || msg.includes("TIMEOUT");
      if (!shouldTryNext && !msg.includes("SERVER_ERROR")) {
        // igualmente probar siguiente, pero guardar
      }
      continue;
    }
  }
  throw lastError ?? new Error("RPC_ERROR");
}

/**
 * Obtiene el balance nativo de una dirección en una sola red via RPC.
 * @param {string} rpcUrl
 * @param {string} address
 * @returns {Promise<bigint>}
 */
export async function getNetworkBalance(rpcUrl, address) {
  const provider = new JsonRpcProvider(rpcUrl);
  return provider.getBalance(address);
}

/**
 * Obtiene balances para todas las EVM_NETWORKS (o lista custom) y devuelve
 * el array categorizado/ordenado de mayor a menor saldo.
 * Tolera fallos de RPC individuales (los marca con 0n y `error`).
 *
 * @param {string} address - dirección EVM a consultar
 * @param {Array} networks - opcional, por defecto EVM_NETWORKS
 * @param {{ timeoutMs?: number }} opts
 * @returns {Promise<Array<{chainId, name, symbol, rpcUrl, explorer, balanceWei: bigint, balance: string, balanceFormatted: string}>>}
 */
export async function getNetworksSortedByBalance(address, networks = EVM_NETWORKS, opts = {}) {
  const { timeoutMs = 7000 } = opts;
  if (!address) throw new Error("Dirección requerida para consultar balances");

  const results = await Promise.all(
    networks.map(async (net) => {
      const urls = net.rpcUrls?.length ? net.rpcUrls : [net.rpcUrl];
      try {
        const { balWei, url } = await tryGetBalanceWithFallback(urls, address, timeoutMs);
        const balFormatted = formatEther(balWei);
        return {
          ...net,
          rpcUrl: url, // RPC que respondió
          balanceWei: balWei,
          balance: balFormatted,
          balanceFormatted: balFormatted,
          error: null,
          errorShort: null,
        };
      } catch (e) {
        return {
          ...net,
          balanceWei: 0n,
          balance: "0.0",
          balanceFormatted: "0.0",
          error: String(e?.message ?? "RPC_ERROR"),
          errorShort: formatRpcError(e),
        };
      }
    })
  );

  return sortNetworksByBalance(results);
}

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

  return () => {
    if (provider) {
      if (onAccountsChanged) provider.removeListener("accountsChanged", onAccountsChanged);
      if (onChainChanged) provider.removeListener("chainChanged", onChainChanged);
    }
  };
}