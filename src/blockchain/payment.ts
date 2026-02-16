import { parseEther, type Address, type Hex } from "viem";
import {
  createMonadWalletClient,
  getMonadClient,
  monadTestnet,
  waitForTransaction,
  getExplorerTxUrl,
} from "./monad.js";
import { getActiveWallet } from "./wallet.js";

// === Types ===

export interface PaymentResult {
  txHash: Hex;
  explorerUrl: string;
  from: Address;
  to: Address;
  amountWei: bigint;
}

export interface PaymentVerification {
  verified: boolean;
  txHash: Hex;
  from: Address;
  to: Address;
  valueWei: bigint;
  status: "success" | "reverted" | "pending";
  blockNumber: bigint;
}

// === Payment Functions ===

/**
 * Send MON directly to an address.
 * Used as fallback when Nad.fun token launch is unavailable.
 */
export async function sendPayment(
  to: Address,
  amountMon: string,
): Promise<PaymentResult> {
  const wallet = getActiveWallet();
  if (!wallet) {
    throw new Error("No wallet configured. Run 'mm wallet create' first.");
  }

  const walletClient = createMonadWalletClient(wallet.privateKey);
  const amountWei = parseEther(amountMon);

  const txHash = await walletClient.sendTransaction({
    chain: monadTestnet,
    account: walletClient.account!,
    to,
    value: amountWei,
  });

  await waitForTransaction(txHash);

  return {
    txHash,
    explorerUrl: getExplorerTxUrl(txHash),
    from: wallet.address,
    to,
    amountWei,
  };
}

/**
 * Verify a payment transaction on-chain.
 * Checks: tx exists, status=success, recipient matches, value >= minimum.
 */
export async function verifyPayment(
  txHash: Hex,
  expectedTo: Address,
  minAmountWei: bigint,
): Promise<PaymentVerification> {
  const client = getMonadClient();

  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const tx = await client.getTransaction({ hash: txHash });

  const toAddress = (tx.to ?? "0x0000000000000000000000000000000000000000") as Address;
  const status = receipt.status === "success" ? "success" : "reverted";

  const verified =
    status === "success" &&
    toAddress.toLowerCase() === expectedTo.toLowerCase() &&
    tx.value >= minAmountWei;

  return {
    verified,
    txHash,
    from: tx.from as Address,
    to: toAddress,
    valueWei: tx.value,
    status,
    blockNumber: receipt.blockNumber,
  };
}
