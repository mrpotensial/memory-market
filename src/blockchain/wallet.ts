import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { formatEther, type Address, type Hex } from "viem";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getMonadClient, isMainnet } from "./monad.js";

// === Types ===

export interface WalletInfo {
  address: Address;
  privateKey: Hex;
}

// === Wallet Manager ===

const WALLET_DIR = join(homedir(), ".memory-markets", "wallets");
const DEFAULT_WALLET_FILE = join(WALLET_DIR, "default.json");

/** Create a new wallet with a random private key */
export function createWallet(): WalletInfo {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  return {
    address: account.address,
    privateKey,
  };
}

/** Load a wallet from a private key */
export function loadWallet(privateKey: Hex): WalletInfo {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    privateKey,
  };
}

/** Save wallet to the default location */
export function saveWallet(wallet: WalletInfo): void {
  mkdirSync(WALLET_DIR, { recursive: true });
  writeFileSync(
    DEFAULT_WALLET_FILE,
    JSON.stringify(
      {
        address: wallet.address,
        privateKey: wallet.privateKey,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

/** Load the default saved wallet, if it exists */
export function loadSavedWallet(): WalletInfo | null {
  if (!existsSync(DEFAULT_WALLET_FILE)) return null;

  try {
    const data = JSON.parse(readFileSync(DEFAULT_WALLET_FILE, "utf-8"));
    return loadWallet(data.privateKey as Hex);
  } catch {
    return null;
  }
}

/** Get the wallet from .env config or saved wallet */
export function getActiveWallet(): WalletInfo | null {
  // Try from environment first
  const envKey = process.env.AGENT_PRIVATE_KEY;
  if (envKey && envKey.startsWith("0x")) {
    return loadWallet(envKey as Hex);
  }

  // Try saved wallet
  return loadSavedWallet();
}

/** Get the MON balance for an address */
export async function getBalance(address: Address): Promise<{
  wei: bigint;
  formatted: string;
}> {
  const client = getMonadClient();
  const balance = await client.getBalance({ address });
  return {
    wei: balance,
    formatted: formatEther(balance),
  };
}

/** Request testnet MON from faucet (mainnet not supported) */
export async function requestFaucet(address: Address): Promise<{
  success: boolean;
  message: string;
}> {
  if (isMainnet()) {
    return {
      success: false,
      message: "Faucet not available on mainnet. You need real MON — buy from an exchange or bridge.",
    };
  }

  const faucetUrls = [
    "https://agents.devnads.com/v1/faucet",
  ];

  for (const url of faucetUrls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, chainId: 10143 }),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, message: `Faucet request successful: ${JSON.stringify(data)}` };
      }

      const errorText = await response.text();
      return { success: false, message: `Faucet responded with ${response.status}: ${errorText}` };
    } catch (err) {
      continue; // Try next faucet
    }
  }

  return {
    success: false,
    message: "All faucets failed. Try manually at https://faucet.monad.xyz/",
  };
}
