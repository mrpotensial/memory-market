import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
  type Hex,
  type Address,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// === Monad Chain Definitions ===

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://testnet-rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
});

export const monadMainnet = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Monadscan",
      url: "https://monadscan.com",
    },
  },
});

/** Get the active chain based on MONAD_CHAIN_ID env var */
export function getActiveChain(): Chain {
  const chainId = parseInt(process.env.MONAD_CHAIN_ID || "10143", 10);
  if (chainId === 143) return monadMainnet;
  return monadTestnet;
}

/** Check if running on mainnet */
export function isMainnet(): boolean {
  return getActiveChain().id === 143;
}

/** Get the RPC URL for the active chain */
function getActiveRpcUrl(): string {
  const envRpc = process.env.MONAD_RPC_URL;
  if (envRpc) return envRpc;
  return isMainnet()
    ? "https://rpc.monad.xyz"
    : "https://testnet-rpc.monad.xyz";
}

// === Singleton Clients ===

let _publicClient: PublicClient<Transport, Chain> | null = null;
let _cachedChainId: number | null = null;

/** Get a public client for the active Monad network (read-only operations) */
export function getMonadClient(): PublicClient<Transport, Chain> {
  const chain = getActiveChain();
  // Reset client if chain changed
  if (_publicClient && _cachedChainId !== chain.id) {
    _publicClient = null;
  }
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain,
      transport: http(getActiveRpcUrl()),
    });
    _cachedChainId = chain.id;
  }
  return _publicClient;
}

/** Create a wallet client for the active Monad network (write operations) */
export function createMonadWalletClient(
  privateKey: Hex,
): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: getActiveChain(),
    transport: http(getActiveRpcUrl()),
  });
}

// === Helper Functions ===

/** Get the current block number */
export async function getBlockNumber(): Promise<bigint> {
  const client = getMonadClient();
  return client.getBlockNumber();
}

/** Get the current gas price */
export async function getGasPrice(): Promise<bigint> {
  const client = getMonadClient();
  return client.getGasPrice();
}

/** Wait for a transaction receipt with timeout */
export async function waitForTransaction(
  txHash: Hex,
  timeoutMs: number = 60_000,
): Promise<TransactionReceipt> {
  const client = getMonadClient();
  return client.waitForTransactionReceipt({
    hash: txHash,
    timeout: timeoutMs,
  });
}

/** Get the explorer URL for a transaction */
export function getExplorerTxUrl(txHash: Hex): string {
  return `${getActiveChain().blockExplorers!.default.url}/tx/${txHash}`;
}

/** Get the explorer URL for an address */
export function getExplorerAddressUrl(address: Address): string {
  return `${getActiveChain().blockExplorers!.default.url}/address/${address}`;
}
