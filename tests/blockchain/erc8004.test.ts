import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the monad module
vi.mock("../../src/blockchain/monad.js", () => ({
  monadTestnet: {
    id: 10143,
    name: "Monad Testnet",
  },
  getMonadClient: vi.fn(() => ({
    readContract: vi.fn(),
    getBlockNumber: vi.fn(() => Promise.resolve(100n)),
  })),
  createMonadWalletClient: vi.fn(() => ({
    account: { address: "0x1234567890abcdef1234567890abcdef12345678" },
    chain: { id: 10143 },
    writeContract: vi.fn(() => Promise.resolve("0xtxhash")),
  })),
  waitForTransaction: vi.fn(() =>
    Promise.resolve({
      logs: [
        {
          address: "0x230ce2878e025a807ba7a20a8e5094ad8fe3c669",
          topics: [
            "0xRegisteredEvent",
            "0x0000000000000000000000000000000000000000000000000000000000000001",
            "0x0000000000000000000000001234567890abcdef1234567890abcdef12345678",
          ],
        },
      ],
    }),
  ),
  getExplorerTxUrl: vi.fn((hash: string) => `https://testnet.monadexplorer.com/tx/${hash}`),
}));

// Mock config
vi.mock("../../src/config.js", () => ({
  getConfig: vi.fn(() => ({
    erc8004IdentityAddress: "0x230ce2878e025a807ba7a20a8e5094ad8fe3c669",
    erc8004ReputationAddress: "0xfb7df6ee2ec5c27e620b8926611567bb48d13ee5",
  })),
}));

import { ERC8004Client, buildAgentURI } from "../../src/blockchain/erc8004.js";
import { getMonadClient } from "../../src/blockchain/monad.js";

describe("ERC8004Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates client without private key (read-only)", () => {
      const client = new ERC8004Client();
      expect(client).toBeDefined();
    });

    it("creates client with private key (read-write)", () => {
      const client = new ERC8004Client("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
      expect(client).toBeDefined();
    });
  });

  describe("isRegistered", () => {
    it("returns true when contract deployed and balance > 0", async () => {
      const mockReadContract = vi.fn().mockResolvedValue(1n);
      const mockGetCode = vi.fn().mockResolvedValue("0x6080604052");
      vi.mocked(getMonadClient).mockReturnValue({
        readContract: mockReadContract,
        getCode: mockGetCode,
      } as any);

      const client = new ERC8004Client();
      const result = await client.isRegistered("0x1234567890abcdef1234567890abcdef12345678");
      expect(result).toBe(true);
      expect(mockGetCode).toHaveBeenCalled();
      expect(mockReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "balanceOf",
        }),
      );
    });

    it("returns false when balance is 0", async () => {
      const mockReadContract = vi.fn().mockResolvedValue(0n);
      const mockGetCode = vi.fn().mockResolvedValue("0x6080604052");
      vi.mocked(getMonadClient).mockReturnValue({
        readContract: mockReadContract,
        getCode: mockGetCode,
      } as any);

      const client = new ERC8004Client();
      const result = await client.isRegistered("0x1234567890abcdef1234567890abcdef12345678");
      expect(result).toBe(false);
    });

    it("returns false when contract not deployed", async () => {
      const mockGetCode = vi.fn().mockResolvedValue("0x");
      vi.mocked(getMonadClient).mockReturnValue({
        getCode: mockGetCode,
      } as any);

      const client = new ERC8004Client();
      const result = await client.isRegistered("0x1234567890abcdef1234567890abcdef12345678");
      expect(result).toBe(false);
    });

    it("returns false when contract call fails", async () => {
      const mockReadContract = vi.fn().mockRejectedValue(new Error("RPC error"));
      const mockGetCode = vi.fn().mockResolvedValue("0x6080604052");
      vi.mocked(getMonadClient).mockReturnValue({
        readContract: mockReadContract,
        getCode: mockGetCode,
      } as any);

      const client = new ERC8004Client();
      const result = await client.isRegistered("0x1234567890abcdef1234567890abcdef12345678");
      expect(result).toBe(false);
    });
  });

  describe("getIdentity", () => {
    it("returns identity for valid agentId", async () => {
      const mockReadContract = vi.fn()
        .mockResolvedValueOnce("0x1234567890abcdef1234567890abcdef12345678") // ownerOf
        .mockResolvedValueOnce("data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9"); // tokenURI
      vi.mocked(getMonadClient).mockReturnValue({
        readContract: mockReadContract,
      } as any);

      const client = new ERC8004Client();
      const identity = await client.getIdentity(1n);
      expect(identity).not.toBeNull();
      expect(identity!.agentId).toBe(1n);
      expect(identity!.owner).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(identity!.agentURI).toContain("data:");
    });

    it("returns null for non-existent agentId", async () => {
      const mockReadContract = vi.fn().mockRejectedValue(new Error("ERC721: invalid token ID"));
      vi.mocked(getMonadClient).mockReturnValue({
        readContract: mockReadContract,
      } as any);

      const client = new ERC8004Client();
      const identity = await client.getIdentity(999999n);
      expect(identity).toBeNull();
    });
  });

  describe("getReputationSummary", () => {
    it("returns reputation summary for valid agentId", async () => {
      const mockReadContract = vi.fn().mockResolvedValue([5n, 25n, 0]);
      vi.mocked(getMonadClient).mockReturnValue({
        readContract: mockReadContract,
      } as any);

      const client = new ERC8004Client();
      const rep = await client.getReputationSummary(1n);
      expect(rep).not.toBeNull();
      expect(rep!.feedbackCount).toBe(5n);
      expect(rep!.summaryValue).toBe(25n);
      expect(rep!.summaryValueDecimals).toBe(0);
    });

    it("returns null when contract call fails", async () => {
      const mockReadContract = vi.fn().mockRejectedValue(new Error("RPC error"));
      vi.mocked(getMonadClient).mockReturnValue({
        readContract: mockReadContract,
      } as any);

      const client = new ERC8004Client();
      const rep = await client.getReputationSummary(1n);
      expect(rep).toBeNull();
    });
  });

  describe("getClients", () => {
    it("returns client addresses", async () => {
      const addresses = [
        "0xaaaa567890abcdef1234567890abcdef12345678",
        "0xbbbb567890abcdef1234567890abcdef12345678",
      ];
      const mockReadContract = vi.fn().mockResolvedValue(addresses);
      vi.mocked(getMonadClient).mockReturnValue({
        readContract: mockReadContract,
      } as any);

      const client = new ERC8004Client();
      const clients = await client.getClients(1n);
      expect(clients).toHaveLength(2);
    });

    it("returns empty array on error", async () => {
      const mockReadContract = vi.fn().mockRejectedValue(new Error("error"));
      vi.mocked(getMonadClient).mockReturnValue({
        readContract: mockReadContract,
      } as any);

      const client = new ERC8004Client();
      const clients = await client.getClients(1n);
      expect(clients).toEqual([]);
    });
  });

  describe("registerAgent", () => {
    it("throws without private key", async () => {
      const client = new ERC8004Client();
      await expect(client.registerAgent("test-uri")).rejects.toThrow("Private key required");
    });

    it("throws when contract not deployed", async () => {
      const mockGetCode = vi.fn().mockResolvedValue("0x");
      vi.mocked(getMonadClient).mockReturnValue({
        getCode: mockGetCode,
      } as any);

      const client = new ERC8004Client("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
      await expect(client.registerAgent("test-uri")).rejects.toThrow("not deployed");
    });

    it("registers and returns agentId from event logs", async () => {
      // Mock getCode to return bytecode (contract exists)
      const mockGetCode = vi.fn().mockResolvedValue("0x6080604052");
      vi.mocked(getMonadClient).mockReturnValue({
        getCode: mockGetCode,
      } as any);

      const client = new ERC8004Client("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
      const result = await client.registerAgent("data:application/json;base64,test");
      expect(result.agentId).toBe(1n);
      expect(result.txHash).toBe("0xtxhash");
      expect(result.explorerUrl).toContain("monadexplorer.com");
    });
  });

  describe("giveFeedback", () => {
    it("throws without private key", async () => {
      const client = new ERC8004Client();
      await expect(client.giveFeedback(1n, 5)).rejects.toThrow("Private key required");
    });

    it("throws when reputation contract not deployed", async () => {
      const mockGetCode = vi.fn().mockResolvedValue("0x");
      vi.mocked(getMonadClient).mockReturnValue({
        getCode: mockGetCode,
      } as any);

      const client = new ERC8004Client("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
      await expect(client.giveFeedback(1n, 5)).rejects.toThrow("not deployed");
    });
  });

  describe("verifyContracts", () => {
    it("returns true when contracts have bytecode", async () => {
      const mockGetCode = vi.fn().mockResolvedValue("0x6080604052");
      vi.mocked(getMonadClient).mockReturnValue({
        getCode: mockGetCode,
      } as any);

      const client = new ERC8004Client();
      const result = await client.verifyContracts();
      expect(result.identity).toBe(true);
      expect(result.reputation).toBe(true);
    });

    it("returns false when contracts have no bytecode", async () => {
      const mockGetCode = vi.fn().mockResolvedValue("0x");
      vi.mocked(getMonadClient).mockReturnValue({
        getCode: mockGetCode,
      } as any);

      const client = new ERC8004Client();
      const result = await client.verifyContracts();
      expect(result.identity).toBe(false);
      expect(result.reputation).toBe(false);
    });

    it("returns false when RPC fails", async () => {
      const mockGetCode = vi.fn().mockRejectedValue(new Error("RPC error"));
      vi.mocked(getMonadClient).mockReturnValue({
        getCode: mockGetCode,
      } as any);

      const client = new ERC8004Client();
      const result = await client.verifyContracts();
      expect(result.identity).toBe(false);
      expect(result.reputation).toBe(false);
    });
  });
});

describe("buildAgentURI", () => {
  it("creates valid data URI with JSON", () => {
    const uri = buildAgentURI(
      "MemoryMarketsAgent",
      "AI knowledge marketplace agent",
      ["search", "buy", "query"],
    );
    expect(uri).toMatch(/^data:application\/json;base64,/);

    // Decode and verify
    const base64 = uri.replace("data:application/json;base64,", "");
    const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
    expect(decoded.name).toBe("MemoryMarketsAgent");
    expect(decoded.capabilities).toContain("search");
    expect(decoded.platform).toBe("memory-markets");
    expect(decoded.chain).toBe("monad-testnet");
  });
});
