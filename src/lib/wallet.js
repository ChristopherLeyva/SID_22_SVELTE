 import { BrowserProvider, formatEther, formatUnits } from "ethers";

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

const EXPLORERS = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  17000: "https://holesky.etherscan.io",
  560048: "https://hoodi.etherscan.io",
  57: "https://syscoin.blockscout.com",
  570: "https://explorer.rollux.com",
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

async function getPaliProvider() {
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