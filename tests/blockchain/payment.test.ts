import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseEther } from "viem";

const {
  mockSendTransaction,
  mockGetTransactionReceipt,
  mockGetTransaction,
  mockCreateMonadWalletClient,
  mockGetMonadClient,
  mockWaitForTransaction,
  mockGetExplorerTxUrl,
  mockGetActiveWallet,
} = vi.hoisted(() => ({
  mockSendTransaction: vi.fn(),
  mockGetTransactionReceipt: vi.fn(),
  mockGetTransaction: vi.fn(),
  mockCreateMonadWalletClient: vi.fn(),
  mockGetMonadClient: vi.fn(),
  mockWaitForTransaction: vi.fn(),
  mockGetExplorerTxUrl: vi.fn(),
  mockGetActiveWallet: vi.fn(),
}));

vi.mock("../../src/blockchain/monad.js", () => ({
  createMonadWalletClient: mockCreateMonadWalletClient,
  getMonadClient: mockGetMonadClient,
  monadTestnet: { id: 10143, name: "Monad Testnet" },
  waitForTransaction: mockWaitForTransaction,
  getExplorerTxUrl: mockGetExplorerTxUrl,
}));

vi.mock("../../src/blockchain/wallet.js", () => ({
  getActiveWallet: mockGetActiveWallet,
}));

import { sendPayment, verifyPayment } from "../../src/blockchain/payment.js";

describe("Payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default implementations
    mockSendTransaction.mockResolvedValue("0xtxhash123");
    mockCreateMonadWalletClient.mockReturnValue({
      account: { address: "0x1234567890123456789012345678901234567890" },
      sendTransaction: mockSendTransaction,
    });
    mockGetMonadClient.mockReturnValue({
      getTransactionReceipt: mockGetTransactionReceipt,
      getTransaction: mockGetTransaction,
    });
    mockGetTransactionReceipt.mockResolvedValue({
      status: "success",
      blockNumber: 12345n,
    });
    mockGetTransaction.mockResolvedValue({
      from: "0x1234567890123456789012345678901234567890",
      to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      value: parseEther("0.5"),
    });
    mockWaitForTransaction.mockResolvedValue({ status: "success" });
    mockGetExplorerTxUrl.mockReturnValue("https://testnet.monadexplorer.com/tx/0xtxhash123");
    mockGetActiveWallet.mockReturnValue({
      address: "0x1234567890123456789012345678901234567890",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    });
  });

  describe("sendPayment", () => {
    it("sends MON to the specified address", async () => {
      const result = await sendPayment(
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
        "0.5",
      );

      expect(result.txHash).toBe("0xtxhash123");
      expect(result.from).toBe("0x1234567890123456789012345678901234567890");
      expect(result.to).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      expect(result.amountWei).toBe(parseEther("0.5"));
      expect(result.explorerUrl).toContain("0xtxhash123");
    });

    it("creates a wallet client with the active wallet key", async () => {
      await sendPayment(
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
        "1.0",
      );

      expect(mockCreateMonadWalletClient).toHaveBeenCalledWith(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      );
    });

    it("waits for transaction confirmation", async () => {
      await sendPayment(
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
        "0.1",
      );

      expect(mockWaitForTransaction).toHaveBeenCalledWith("0xtxhash123");
    });

    it("throws if no wallet is configured", async () => {
      mockGetActiveWallet.mockReturnValueOnce(null);

      await expect(
        sendPayment(
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
          "0.5",
        ),
      ).rejects.toThrow("No wallet configured");
    });

    it("handles various MON amounts correctly", async () => {
      const result = await sendPayment(
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
        "10.0",
      );

      expect(result.amountWei).toBe(parseEther("10.0"));
    });
  });

  describe("verifyPayment", () => {
    it("verifies a valid payment", async () => {
      const result = await verifyPayment(
        "0xtxhash123" as `0x${string}`,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
        parseEther("0.5"),
      );

      expect(result.verified).toBe(true);
      expect(result.status).toBe("success");
      expect(result.from).toBe("0x1234567890123456789012345678901234567890");
      expect(result.to).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      expect(result.blockNumber).toBe(12345n);
    });

    it("rejects payment to wrong address", async () => {
      const result = await verifyPayment(
        "0xtxhash123" as `0x${string}`,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`,
        parseEther("0.5"),
      );

      expect(result.verified).toBe(false);
    });

    it("rejects payment with insufficient amount", async () => {
      const result = await verifyPayment(
        "0xtxhash123" as `0x${string}`,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
        parseEther("1.0"),
      );

      expect(result.verified).toBe(false);
    });

    it("rejects reverted transactions", async () => {
      mockGetTransactionReceipt.mockResolvedValueOnce({
        status: "reverted",
        blockNumber: 12345n,
      });

      const result = await verifyPayment(
        "0xtxhash123" as `0x${string}`,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
        parseEther("0.5"),
      );

      expect(result.verified).toBe(false);
      expect(result.status).toBe("reverted");
    });

    it("returns full verification details", async () => {
      const result = await verifyPayment(
        "0xtxhash123" as `0x${string}`,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
        parseEther("0.1"),
      );

      expect(result.txHash).toBe("0xtxhash123");
      expect(result.valueWei).toBe(parseEther("0.5"));
      expect(result.blockNumber).toBe(12345n);
    });
  });
});
