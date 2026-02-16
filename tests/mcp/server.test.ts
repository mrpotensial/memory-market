import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the MCP SDK
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  const tools: Map<string, any> = new Map();
  return {
    McpServer: vi.fn().mockImplementation(() => ({
      tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
        tools.set(name, { name, description: desc, schema, handler });
      }),
      connect: vi.fn(),
      _tools: tools,
    })),
    _getTools: () => tools,
  };
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

// Mock registry
vi.mock("../../src/marketplace/registry.js", () => ({
  MarketplaceRegistry: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    getAllPackages: vi.fn().mockReturnValue([
      {
        id: "pkg-test",
        name: "Test Package",
        description: "A test knowledge package",
        tags: "test",
        priceMon: 0.5,
        fileCount: 3,
        chunkCount: 10,
        entityCount: 5,
        timesSold: 2,
      },
    ]),
    getPackage: vi.fn().mockReturnValue({
      id: "pkg-test",
      name: "Test Package",
      description: "A test knowledge package",
      priceMon: 0.5,
      creatorAddress: null,
    }),
    getOpenBounties: vi.fn().mockReturnValue([]),
    getAllTransactions: vi.fn().mockReturnValue([]),
    recordSale: vi.fn(),
    postBounty: vi.fn().mockReturnValue("bounty-test"),
    close: vi.fn(),
  })),
}));

vi.mock("../../src/marketplace/search.js", () => ({
  MarketplaceSearch: vi.fn().mockImplementation(() => ({
    loadSummaryIndex: vi.fn(),
    search: vi.fn().mockResolvedValue([
      {
        listing: {
          id: "pkg-test",
          name: "Test Package",
          description: "A test package",
          priceMon: 0.5,
        },
        score: 0.95,
        matchType: "keyword",
      },
    ]),
  })),
}));

vi.mock("../../src/blockchain/wallet.js", () => ({
  getActiveWallet: vi.fn().mockReturnValue({
    address: "0x1234567890abcdef1234567890abcdef12345678",
    privateKey: "0xabcdef",
  }),
  getBalance: vi.fn().mockResolvedValue({ formatted: "10.5", wei: 10500000000000000000n }),
}));

vi.mock("../../src/blockchain/erc8004.js", () => ({
  ERC8004Client: vi.fn().mockImplementation(() => ({
    isRegistered: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock("../../src/agent/memory.js", () => ({
  loadMemory: vi.fn().mockReturnValue({
    reputation: {
      tasksCompleted: 5,
      knowledgeBought: 3,
      knowledgeSold: 0,
      totalMonSpent: 2.5,
      totalMonEarned: 0,
      avgQueryQuality: 0,
      level: "trader",
    },
  }),
  getReputationSummary: vi.fn().mockReturnValue("TRADER | 5 tasks | 3 buys | 2.50 MON spent"),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("MCP Server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates McpServer with correct name and version", async () => {
    const { startMcpServer } = await import("../../src/mcp/server.js");
    await startMcpServer();

    expect(McpServer).toHaveBeenCalledWith({
      name: "memory-markets",
      version: "0.1.0",
    });
  });

  it("registers all expected tools", async () => {
    const { startMcpServer } = await import("../../src/mcp/server.js");
    await startMcpServer();

    const serverInstance = vi.mocked(McpServer).mock.results[0]?.value;
    expect(serverInstance.tool).toHaveBeenCalledTimes(9);

    // Verify tool names
    const toolNames = vi.mocked(serverInstance.tool).mock.calls.map((call: any[]) => call[0]);
    expect(toolNames).toContain("search_marketplace");
    expect(toolNames).toContain("list_packages");
    expect(toolNames).toContain("buy_package");
    expect(toolNames).toContain("check_balance");
    expect(toolNames).toContain("get_bounties");
    expect(toolNames).toContain("post_bounty");
    expect(toolNames).toContain("run_agent");
    expect(toolNames).toContain("get_stats");
    expect(toolNames).toContain("get_agent_identity");
  });

  it("connects to stdio transport", async () => {
    const { startMcpServer } = await import("../../src/mcp/server.js");
    await startMcpServer();

    const serverInstance = vi.mocked(McpServer).mock.results[0]?.value;
    expect(serverInstance.connect).toHaveBeenCalledTimes(1);
  });
});
