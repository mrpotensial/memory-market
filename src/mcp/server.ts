import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * Memory Markets MCP Server
 *
 * Exposes Memory Markets functionality as MCP tools that can be used by
 * Claude Desktop, Cursor, VS Code, and any MCP-compatible client.
 *
 * Start with: `mm mcp` or `npx tsx src/mcp/server.ts`
 */
export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "memory-markets",
    version: "0.1.0",
  });

  // === Tool 1: Search Marketplace ===

  server.tool(
    "search_marketplace",
    "Search the Memory Markets knowledge marketplace for packages matching a query. Returns relevant knowledge packages with scores.",
    { query: z.string().describe("Search query to find relevant knowledge packages") },
    async ({ query }) => {
      const { MarketplaceRegistry } = await import("../marketplace/registry.js");
      const { MarketplaceSearch } = await import("../marketplace/search.js");

      const registry = new MarketplaceRegistry();
      await registry.init();
      const search = new MarketplaceSearch(registry);
      search.loadSummaryIndex();
      const results = await search.search(query, 5);
      registry.close();

      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: `No packages found for "${query}".` }] };
      }

      const text = results.map((r) =>
        `- ${r.listing.name} (ID: ${r.listing.id}, Price: ${r.listing.priceMon} MON, Score: ${(r.score * 100).toFixed(0)}%)\n  ${r.listing.description}`,
      ).join("\n");

      return { content: [{ type: "text" as const, text: `Found ${results.length} package(s):\n${text}` }] };
    },
  );

  // === Tool 2: List All Packages ===

  server.tool(
    "list_packages",
    "List all available knowledge packages on the Memory Markets marketplace.",
    {},
    async () => {
      const { MarketplaceRegistry } = await import("../marketplace/registry.js");

      const registry = new MarketplaceRegistry();
      await registry.init();
      const packages = registry.getAllPackages();
      registry.close();

      if (packages.length === 0) {
        return { content: [{ type: "text" as const, text: "Marketplace is empty." }] };
      }

      const text = packages.map((p) =>
        `- ${p.name} (ID: ${p.id}, Price: ${p.priceMon} MON, Files: ${p.fileCount}, Sold: ${p.timesSold})\n  ${p.description}`,
      ).join("\n");

      return { content: [{ type: "text" as const, text: `${packages.length} package(s) available:\n${text}` }] };
    },
  );

  // === Tool 3: Buy Package ===

  server.tool(
    "buy_package",
    "Buy a knowledge package from Memory Markets. Sends MON payment on Monad blockchain.",
    { packageId: z.string().describe("The package ID to purchase") },
    async ({ packageId }) => {
      const { MarketplaceRegistry } = await import("../marketplace/registry.js");
      const { getActiveWallet } = await import("../blockchain/wallet.js");
      const { sendPayment } = await import("../blockchain/payment.js");

      const registry = new MarketplaceRegistry();
      await registry.init();
      const pkg = registry.getPackage(packageId);

      if (!pkg) {
        registry.close();
        return { content: [{ type: "text" as const, text: `Package "${packageId}" not found.` }] };
      }

      const wallet = getActiveWallet();
      if (!wallet) {
        registry.close();
        return { content: [{ type: "text" as const, text: "No wallet configured. Set AGENT_PRIVATE_KEY." }] };
      }

      let txHash = "local";
      if (pkg.creatorAddress && pkg.priceMon > 0) {
        try {
          const result = await sendPayment(pkg.creatorAddress as `0x${string}`, pkg.priceMon.toString());
          txHash = result.txHash;
        } catch {
          txHash = "local-fallback";
        }
      }

      registry.recordSale(packageId, wallet.address, pkg.priceMon, txHash);
      registry.close();

      return {
        content: [{
          type: "text" as const,
          text: `Bought "${pkg.name}" for ${pkg.priceMon} MON. Tx: ${txHash}`,
        }],
      };
    },
  );

  // === Tool 4: Check Wallet Balance ===

  server.tool(
    "check_balance",
    "Check the agent wallet's MON balance on Monad testnet.",
    {},
    async () => {
      const { getActiveWallet, getBalance } = await import("../blockchain/wallet.js");

      const wallet = getActiveWallet();
      if (!wallet) {
        return { content: [{ type: "text" as const, text: "No wallet configured." }] };
      }

      const balance = await getBalance(wallet.address);
      return {
        content: [{
          type: "text" as const,
          text: `Wallet ${wallet.address}: ${balance.formatted} MON`,
        }],
      };
    },
  );

  // === Tool 5: Get Open Bounties ===

  server.tool(
    "get_bounties",
    "Check open knowledge bounties on Memory Markets. Bounties are requests from agents willing to pay for specific knowledge.",
    {},
    async () => {
      const { MarketplaceRegistry } = await import("../marketplace/registry.js");

      const registry = new MarketplaceRegistry();
      await registry.init();
      const bounties = registry.getOpenBounties();
      registry.close();

      if (bounties.length === 0) {
        return { content: [{ type: "text" as const, text: "No open bounties." }] };
      }

      const text = bounties.map(
        (b) => `- [${b.id}] "${b.topic}" — ${b.rewardMon} MON reward (by ${b.requester.slice(0, 12)}...)`,
      ).join("\n");

      return { content: [{ type: "text" as const, text: `${bounties.length} open bounty/bounties:\n${text}` }] };
    },
  );

  // === Tool 6: Post Bounty ===

  server.tool(
    "post_bounty",
    "Post a knowledge bounty on Memory Markets — request specific knowledge and offer a MON reward.",
    {
      topic: z.string().describe("The knowledge topic you need"),
      rewardMon: z.number().describe("MON reward offered"),
    },
    async ({ topic, rewardMon }) => {
      const { MarketplaceRegistry } = await import("../marketplace/registry.js");
      const { getActiveWallet } = await import("../blockchain/wallet.js");

      const wallet = getActiveWallet();
      const registry = new MarketplaceRegistry();
      await registry.init();
      const bountyId = registry.postBounty(topic, rewardMon, wallet?.address ?? "mcp-agent");
      registry.close();

      return {
        content: [{
          type: "text" as const,
          text: `Bounty posted! ID: ${bountyId}. Topic: "${topic}", Reward: ${rewardMon} MON.`,
        }],
      };
    },
  );

  // === Tool 7: Run Autonomous Agent ===

  server.tool(
    "run_agent",
    "Run the Memory Markets autonomous agent with a task. The agent will search, buy, query knowledge, and return an answer.",
    {
      task: z.string().describe("Task for the agent to complete"),
      maxSteps: z.number().optional().describe("Maximum steps (default: 10)"),
      budgetMon: z.number().optional().describe("Budget in MON (default: 5)"),
    },
    async ({ task, maxSteps, budgetMon }) => {
      const { AutonomousAgent } = await import("../agent/autonomous.js");

      const agent = new AutonomousAgent();
      const result = await agent.runTask(task, {
        maxSteps: maxSteps ?? 10,
        budgetMon: budgetMon ?? 5,
      });

      const stepsSummary = result.steps
        .filter((s) => s.tool)
        .map((s) => `  Step ${s.step}: ${s.tool} → ${s.result.slice(0, 100)}`)
        .join("\n");

      return {
        content: [{
          type: "text" as const,
          text: [
            `Task: ${result.task}`,
            `Completed: ${result.completed}`,
            `MON Spent: ${result.monSpent}`,
            `Knowledge: ${result.knowledgeAcquired.join(", ") || "none"}`,
            result.reputation ? `Reputation: ${result.reputation}` : "",
            "",
            "Steps:",
            stepsSummary,
            "",
            "Answer:",
            result.finalAnswer,
          ].filter(Boolean).join("\n"),
        }],
      };
    },
  );

  // === Tool 8: Get Marketplace Stats ===

  server.tool(
    "get_stats",
    "Get Memory Markets marketplace statistics — package count, transactions, total sales volume.",
    {},
    async () => {
      const { MarketplaceRegistry } = await import("../marketplace/registry.js");
      const { getActiveWallet, getBalance } = await import("../blockchain/wallet.js");

      const registry = new MarketplaceRegistry();
      await registry.init();
      const packages = registry.getAllPackages();
      const transactions = registry.getAllTransactions(100);
      const totalSales = transactions.reduce((sum, t) => sum + t.amountMon, 0);
      registry.close();

      const wallet = getActiveWallet();
      let balance = "N/A";
      if (wallet) {
        try {
          const b = await getBalance(wallet.address);
          balance = b.formatted;
        } catch {
          // RPC might be down
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: [
            `Packages: ${packages.length}`,
            `Transactions: ${transactions.length}`,
            `Total Sales: ${totalSales.toFixed(2)} MON`,
            `Wallet Balance: ${balance} MON`,
            `Wallet Address: ${wallet?.address ?? "not configured"}`,
          ].join("\n"),
        }],
      };
    },
  );

  // === Tool 9: Get Agent Identity (ERC-8004) ===

  server.tool(
    "get_agent_identity",
    "Get the agent's on-chain identity and reputation via ERC-8004 on Monad blockchain.",
    {},
    async () => {
      const { getActiveWallet } = await import("../blockchain/wallet.js");
      const { ERC8004Client } = await import("../blockchain/erc8004.js");
      const { loadMemory, getReputationSummary } = await import("../agent/memory.js");

      const wallet = getActiveWallet();
      if (!wallet) {
        return { content: [{ type: "text" as const, text: "No wallet configured." }] };
      }

      const erc = new ERC8004Client();
      const isRegistered = await erc.isRegistered(wallet.address);
      const memory = loadMemory();

      return {
        content: [{
          type: "text" as const,
          text: [
            `Address: ${wallet.address}`,
            `On-Chain Registered: ${isRegistered ? "Yes" : "No"}`,
            `Local Reputation: ${getReputationSummary(memory)}`,
            `Tasks Completed: ${memory.reputation.tasksCompleted}`,
            `Packages Bought: ${memory.reputation.knowledgeBought}`,
            `MON Spent: ${memory.reputation.totalMonSpent.toFixed(2)}`,
          ].join("\n"),
        }],
      };
    },
  );

  // === Connect ===

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Allow direct execution: `npx tsx src/mcp/server.ts`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("mcp/server.ts")) {
  startMcpServer().catch(console.error);
}
