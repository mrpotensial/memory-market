import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { MarketplaceRegistry } from "../marketplace/registry.js";
import { MarketplaceSearch } from "../marketplace/search.js";
import { AutonomousAgent, type AgentStep } from "../agent/autonomous.js";
import { getActiveWallet, getBalance } from "../blockchain/wallet.js";
import { sendPayment } from "../blockchain/payment.js";
import { getConfig } from "../config.js";
import { getActiveChain, isMainnet } from "../blockchain/monad.js";
import type { Address } from "viem";

const app = new Hono();

// Enable CORS with origin whitelist
app.use("*", cors({
  origin: ["http://localhost:3001", "http://localhost:5173", "http://127.0.0.1:3001", "https://memorymarket.trade"],
}));

// === X402 Payment Middleware (USDC micropayments on Monad) ===

const cfg = getConfig();

if (cfg.x402PayTo) {
  // Dynamic import to avoid breaking if X402 packages are optional
  Promise.all([
    import("@x402/hono"),
    import("@x402/evm/exact/server"),
    import("@x402/core/server"),
  ]).then(([{ paymentMiddlewareFromConfig }, { ExactEvmScheme }, { HTTPFacilitatorClient }]) => {
    const network = cfg.x402Network as `${string}:${string}`;
    const facilitator = new HTTPFacilitatorClient({ url: cfg.x402FacilitatorUrl });
    const evmScheme = new ExactEvmScheme();

    const x402Routes = {
      "GET /api/premium/*": {
        accepts: {
          scheme: "exact",
          network,
          payTo: cfg.x402PayTo!,
          price: "$0.001",
        },
        resource: "Memory Markets Premium Knowledge",
        description: "Access premium knowledge package content via X402 micropayment",
      },
    };

    app.use(
      "/api/premium/*",
      paymentMiddlewareFromConfig(
        x402Routes,
        facilitator,
        [{ network, server: evmScheme }],
        { appName: "Memory Markets", testnet: true },
      ),
    );

    console.log(`  X402:      Enabled (payTo: ${cfg.x402PayTo}, network: ${network})`);
  }).catch((err) => {
    console.warn("  X402:      Disabled (failed to load packages:", (err as Error).message, ")");
  });
}

// === Dashboard UI ===

app.get("/", (c) => {
  // Serve the dashboard HTML
  const htmlPath = join(import.meta.dirname, "../../public/index.html");
  if (existsSync(htmlPath)) {
    const html = readFileSync(htmlPath, "utf-8");
    return c.html(html);
  }
  return c.json({
    name: "Memory Markets API",
    version: "0.1.0",
    description: "Visit /api for API endpoints, or place public/index.html for the dashboard.",
  });
});

// === API Routes ===

app.get("/api", (c) => {
  return c.json({
    name: "Memory Markets API",
    version: "0.1.0",
    endpoints: [
      "GET  /api/packages",
      "GET  /api/packages/:id",
      "POST /api/packages/search",
      "POST /api/packages/:id/buy",
      "GET  /api/wallet",
      "GET  /api/transactions",
      "POST /api/agent/task",
      "POST /api/agent/task/stream (SSE)",
      "GET  /api/stats",
      "GET  /api/premium/packages/:id (X402 gated)",
      "GET  /api/x402/status",
      "POST /api/moltbook/post",
      "GET  /api/moltbook/status",
    ],
  });
});

// --- Packages ---

app.get("/api/packages", async (c) => {
  const registry = new MarketplaceRegistry();
  await registry.init();
  const packages = registry.getAllPackages();
  registry.close();
  return c.json({ packages, count: packages.length });
});

app.get("/api/packages/:id", async (c) => {
  const registry = new MarketplaceRegistry();
  await registry.init();
  const pkg = registry.getPackage(c.req.param("id"));
  registry.close();

  if (!pkg) {
    return c.json({ error: "Package not found" }, 404);
  }
  return c.json(pkg);
});

app.post("/api/packages/search", async (c) => {
  const body = await c.req.json<{ query: string; limit?: number }>();

  if (!body.query || typeof body.query !== "string" || body.query.trim().length === 0) {
    return c.json({ error: "Missing or empty 'query' field" }, 400);
  }

  const registry = new MarketplaceRegistry();
  await registry.init();

  const search = new MarketplaceSearch(registry);
  search.loadSummaryIndex();

  const results = await search.search(body.query, body.limit ?? 10);
  registry.close();

  return c.json({
    query: body.query,
    results: results.map((r) => ({
      ...r.listing,
      score: r.score,
      matchType: r.matchType,
    })),
    count: results.length,
  });
});

// --- Buy Package (direct payment) ---

app.post("/api/packages/:id/buy", async (c) => {
  const packageId = c.req.param("id");

  const registry = new MarketplaceRegistry();
  await registry.init();

  const pkg = registry.getPackage(packageId);
  if (!pkg) {
    registry.close();
    return c.json({ error: "Package not found" }, 404);
  }

  const wallet = getActiveWallet();
  if (!wallet) {
    registry.close();
    return c.json({ error: "No wallet configured" }, 400);
  }

  let txHash = "local";
  let explorerUrl = "";

  // Try direct payment if creator address exists
  if (pkg.creatorAddress && pkg.priceMon > 0) {
    try {
      const result = await sendPayment(
        pkg.creatorAddress as Address,
        pkg.priceMon.toString(),
      );
      txHash = result.txHash;
      explorerUrl = result.explorerUrl;
    } catch (err) {
      txHash = "local-fallback";
    }
  }

  registry.recordSale(packageId, wallet.address, pkg.priceMon, txHash);
  registry.close();

  return c.json({
    success: true,
    packageId,
    packageName: pkg.name,
    priceMon: pkg.priceMon,
    txHash,
    explorerUrl,
    buyerAddress: wallet.address,
  });
});

// --- Wallet ---

app.get("/api/wallet", async (c) => {
  const wallet = getActiveWallet();
  if (!wallet) {
    return c.json({ configured: false });
  }

  let balance = { wei: "0", formatted: "0" };
  try {
    const b = await getBalance(wallet.address);
    balance = { wei: b.wei.toString(), formatted: b.formatted };
  } catch {
    // RPC might be down
  }

  const chain = getActiveChain();
  return c.json({
    configured: true,
    address: wallet.address,
    balance,
    network: chain.name,
    chainId: chain.id,
    explorerUrl: chain.blockExplorers!.default.url,
    isMainnet: isMainnet(),
  });
});

// --- Transactions ---

app.get("/api/transactions", async (c) => {
  const registry = new MarketplaceRegistry();
  await registry.init();
  const transactions = registry.getAllTransactions(50);
  registry.close();
  return c.json({ transactions, count: transactions.length });
});

// --- Stats ---

app.get("/api/stats", async (c) => {
  const registry = new MarketplaceRegistry();
  await registry.init();

  const packages = registry.getAllPackages();
  const transactions = registry.getAllTransactions(100);
  const totalSales = transactions.reduce((sum, t) => sum + t.amountMon, 0);

  registry.close();

  const wallet = getActiveWallet();
  let balance = "0";
  if (wallet) {
    try {
      const b = await getBalance(wallet.address);
      balance = b.formatted;
    } catch {
      // RPC might be down
    }
  }

  return c.json({
    packageCount: packages.length,
    totalTransactions: transactions.length,
    totalSalesMon: totalSales,
    walletBalance: balance,
    walletAddress: wallet?.address ?? null,
  });
});

// --- Agent (standard) ---

app.post("/api/agent/task", async (c) => {
  const body = await c.req.json<{
    task: string;
    maxSteps?: number;
    budgetMon?: number;
  }>();

  if (!body.task || typeof body.task !== "string" || body.task.trim().length === 0) {
    return c.json({ error: "Missing or empty 'task' field" }, 400);
  }

  const agent = new AutonomousAgent();
  const result = await agent.runTask(body.task, {
    maxSteps: body.maxSteps,
    budgetMon: body.budgetMon,
  });

  return c.json(result);
});

// --- Agent (SSE streaming) ---

app.post("/api/agent/task/stream", async (c) => {
  const body = await c.req.json<{
    task: string;
    maxSteps?: number;
    budgetMon?: number;
  }>();

  if (!body.task || typeof body.task !== "string" || body.task.trim().length === 0) {
    return c.json({ error: "Missing or empty 'task' field" }, 400);
  }

  return streamSSE(c, async (stream) => {
    const agent = new AutonomousAgent();

    await stream.writeSSE({
      event: "start",
      data: JSON.stringify({ task: body.task }),
    });

    const result = await agent.runTask(body.task, {
      maxSteps: body.maxSteps ?? 8,
      budgetMon: body.budgetMon ?? 5,
      onStep: (step: AgentStep) => {
        stream.writeSSE({
          event: "step",
          data: JSON.stringify(step),
        });
      },
    });

    await stream.writeSSE({
      event: "complete",
      data: JSON.stringify(result),
    });
  });
});

// --- Multi-Agent ---

app.post("/api/agent/multi", async (c) => {
  const body = await c.req.json<{
    scenario: string;
    maxStepsPerAgent?: number;
    budgetPerAgent?: number;
  }>();

  if (!body.scenario || typeof body.scenario !== "string" || body.scenario.trim().length === 0) {
    return c.json({ error: "Missing or empty 'scenario' field" }, 400);
  }

  const { AgentCoordinator } = await import("../agent/coordinator.js");
  const coordinator = new AgentCoordinator();

  const result = await coordinator.runScenario(body.scenario, {
    maxStepsPerAgent: body.maxStepsPerAgent,
    budgetPerAgent: body.budgetPerAgent,
  });

  return c.json(result);
});

app.post("/api/agent/multi/stream", async (c) => {
  const body = await c.req.json<{
    scenario: string;
    maxStepsPerAgent?: number;
    budgetPerAgent?: number;
  }>();

  if (!body.scenario || typeof body.scenario !== "string" || body.scenario.trim().length === 0) {
    return c.json({ error: "Missing or empty 'scenario' field" }, 400);
  }

  const { AgentCoordinator } = await import("../agent/coordinator.js");

  return streamSSE(c, async (stream) => {
    const coordinator = new AgentCoordinator();

    await stream.writeSSE({
      event: "start",
      data: JSON.stringify({ scenario: body.scenario }),
    });

    const result = await coordinator.runScenario(body.scenario, {
      maxStepsPerAgent: body.maxStepsPerAgent ?? 8,
      budgetPerAgent: body.budgetPerAgent ?? 5,
      onStep: (step) => {
        stream.writeSSE({
          event: "step",
          data: JSON.stringify(step),
        });
      },
    });

    await stream.writeSSE({
      event: "complete",
      data: JSON.stringify(result),
    });
  });
});

// --- Bounties ---

app.get("/api/bounties", async (c) => {
  const registry = new MarketplaceRegistry();
  await registry.init();
  const bounties = registry.getOpenBounties();
  registry.close();
  return c.json({ bounties, count: bounties.length });
});

// --- Agent Identity (ERC-8004) ---

app.get("/api/agent/identity", async (c) => {
  const wallet = getActiveWallet();
  if (!wallet) {
    return c.json({ registered: false, address: null });
  }

  try {
    const { ERC8004Client } = await import("../blockchain/erc8004.js");
    const { loadMemory } = await import("../agent/memory.js");
    const { getConfig } = await import("../config.js");

    const cfg = getConfig();
    const erc = new ERC8004Client();
    const contracts = await erc.verifyContracts();
    const isRegistered = contracts.identity ? await erc.isRegistered(wallet.address) : false;
    const localMemory = loadMemory();

    return c.json({
      registered: isRegistered,
      address: wallet.address,
      localReputation: localMemory.reputation,
      erc8004: {
        identityContract: cfg.erc8004IdentityAddress,
        reputationContract: cfg.erc8004ReputationAddress,
        chain: getActiveChain().name,
        chainId: getActiveChain().id,
        contractsDeployed: contracts.identity && contracts.reputation,
      },
    });
  } catch {
    return c.json({
      registered: false,
      address: wallet.address,
      error: "Could not query on-chain identity",
    });
  }
});

// --- Ratings ---

app.get("/api/packages/:id/ratings", async (c) => {
  const registry = new MarketplaceRegistry();
  await registry.init();
  const ratings = registry.getPackageRatings(c.req.param("id"));
  const avg = registry.getPackageRating(c.req.param("id"));
  registry.close();
  return c.json({ ratings, average: avg });
});

// --- Premium Content (X402 gated) ---

app.get("/api/premium/packages/:id", async (c) => {
  const registry = new MarketplaceRegistry();
  await registry.init();

  const pkg = registry.getPackage(c.req.param("id"));
  if (!pkg) {
    registry.close();
    return c.json({ error: "Package not found" }, 404);
  }

  const ratings = registry.getPackageRatings(c.req.param("id"));
  const avgRating = registry.getPackageRating(c.req.param("id"));
  const transactions = registry.getAllTransactions(100).filter(
    (t) => t.packageId === c.req.param("id"),
  );
  registry.close();

  // Return full premium content (unlocked via X402 payment)
  return c.json({
    package: pkg,
    premium: true,
    content: {
      description: pkg.description,
      tags: pkg.tags.split(",").map((t) => t.trim()),
      packagePath: pkg.packagePath,
      stats: {
        fileCount: pkg.fileCount,
        chunkCount: pkg.chunkCount,
        entityCount: pkg.entityCount,
        timesSold: pkg.timesSold,
      },
    },
    ratings: {
      average: avgRating,
      reviews: ratings,
    },
    salesHistory: transactions.map((t) => ({
      buyer: t.buyerAddress,
      amount: t.amountMon,
      txHash: t.txHash,
      date: t.createdAt,
    })),
    accessedVia: "x402",
    paidWith: "USDC on Monad",
  });
});

// X402 status endpoint (free)
app.get("/api/x402/status", (c) => {
  const config = getConfig();
  return c.json({
    enabled: !!config.x402PayTo,
    network: config.x402Network,
    facilitator: config.x402FacilitatorUrl,
    payTo: config.x402PayTo ?? null,
    premiumEndpoints: [
      "GET /api/premium/packages/:id",
    ],
    price: "$0.001 USDC per request",
    protocol: "X402 (HTTP 402 Payment Required)",
  });
});

// --- Moltbook (Social Network for AI Agents) ---

app.post("/api/moltbook/post", async (c) => {
  const config = getConfig();
  if (!config.moltbookApiKey) {
    return c.json({ error: "Moltbook not configured. Set MOLTBOOK_API_KEY env var." }, 400);
  }

  const body = await c.req.json<{
    title: string;
    content: string;
    submolt?: string;
  }>();

  if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
    return c.json({ error: "Missing or empty 'title' field" }, 400);
  }
  if (!body.content || typeof body.content !== "string" || body.content.trim().length === 0) {
    return c.json({ error: "Missing or empty 'content' field" }, 400);
  }

  const submolt = body.submolt ?? config.moltbookDefaultSubmolt;

  try {
    const res = await fetch(`${config.moltbookApiUrl}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.moltbookApiKey}`,
      },
      body: JSON.stringify({
        submolt,
        title: body.title,
        content: body.content,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      return c.json({
        error: "Moltbook API error",
        status: res.status,
        details: data,
      }, res.status as 400);
    }

    return c.json({
      success: true,
      submolt,
      postId: (data.id ?? data.post_id ?? null) as string | null,
      url: (data.url ?? null) as string | null,
      response: data,
    });
  } catch (err) {
    return c.json({
      error: `Moltbook request failed: ${err instanceof Error ? err.message : String(err)}`,
    }, 502);
  }
});

app.get("/api/moltbook/status", (c) => {
  const config = getConfig();
  return c.json({
    enabled: !!config.moltbookApiKey,
    apiUrl: config.moltbookApiUrl,
    defaultSubmolt: config.moltbookDefaultSubmolt,
    description: "Moltbook — social network for AI agents. Post knowledge findings, agent activity, and marketplace updates.",
  });
});

// --- Seed Demo Data ---

app.post("/api/seed-demo", async (c) => {
  const registry = new MarketplaceRegistry();
  await registry.init();

  const seeded: string[] = [];

  // Seed knowledge packages if none exist
  const existingPkgs = registry.getAllPackages();
  if (existingPkgs.length === 0) {
    const demoPackages = [
      {
        id: "pkg-smart-contract-security",
        name: "Monad Smart Contract Security",
        description: "Comprehensive guide to securing smart contracts on the Monad blockchain. Covers reentrancy protection, access control patterns, and audit best practices.",
        tags: "monad,security,smart-contracts,audit",
        priceMon: 0.5,
        tokenAddress: null,
        curveAddress: null,
        creatorAddress: "0xPublisher001",
        packagePath: "/knowledge/smart-contract-security",
        fileCount: 5,
        chunkCount: 24,
        entityCount: 18,
      },
      {
        id: "pkg-ai-agent-architecture",
        name: "AI Agent Architecture Guide",
        description: "How to build autonomous AI agents with tool use, memory, and marketplace integration. Covers ReAct pattern, function calling, and multi-agent coordination.",
        tags: "ai,agents,architecture,react-pattern",
        priceMon: 0.3,
        tokenAddress: null,
        curveAddress: null,
        creatorAddress: "0xPublisher002",
        packagePath: "/knowledge/ai-agent-architecture",
        fileCount: 3,
        chunkCount: 16,
        entityCount: 12,
      },
      {
        id: "pkg-defi-blockchain-integration",
        name: "Blockchain DeFi Integration",
        description: "Step-by-step guide for integrating DeFi protocols with AI agents. Covers bonding curves, liquidity pools, and token trading on Monad.",
        tags: "defi,blockchain,monad,bonding-curves",
        priceMon: 0.8,
        tokenAddress: null,
        curveAddress: null,
        creatorAddress: "0xPublisher003",
        packagePath: "/knowledge/defi-integration",
        fileCount: 4,
        chunkCount: 20,
        entityCount: 15,
      },
    ];
    for (const pkg of demoPackages) {
      registry.listPackage(pkg);
    }
    seeded.push("3 knowledge packages");
  }

  // Seed bounties if less than 3 exist
  const existingBounties = registry.getOpenBounties();
  if (existingBounties.length < 3) {
    registry.postBounty(
      "Knowledge about smart contract security patterns and best practices",
      2.0,
      "0xBountyAgent001",
    );
    registry.postBounty(
      "Documentation on Monad blockchain architecture and consensus mechanism",
      1.5,
      "0xBountyAgent002",
    );
    registry.postBounty(
      "Guide to building autonomous AI agents with tool-use capabilities",
      3.0,
      "0xBountyAgent003",
    );
    seeded.push("3 bounties");
  }

  // Seed ratings if none exist on any package
  const packages = registry.getAllPackages();
  for (const pkg of packages) {
    const existing = registry.getPackageRating(pkg.id);
    if (!existing) {
      registry.ratePackage(pkg.id, "0xRaterAgent001", 4, "Good knowledge quality, accurate entity extraction");
      registry.ratePackage(pkg.id, "0xRaterAgent002", 5, "Excellent coverage of the codebase architecture");
      registry.ratePackage(pkg.id, "0xRaterAgent003", 3, "Decent but could have more detail on edge cases");
      seeded.push(`3 ratings for ${pkg.id.slice(0, 14)}`);
    }
  }

  registry.close();

  if (seeded.length === 0) {
    return c.json({ message: "Demo data already exists", seeded: [] });
  }

  return c.json({ message: "Demo data seeded successfully", seeded });
});

// === Legacy routes (backward compat) ===

app.get("/packages", async (c) => {
  const registry = new MarketplaceRegistry();
  await registry.init();
  const packages = registry.getAllPackages();
  registry.close();
  return c.json({ packages, count: packages.length });
});

app.post("/packages/search", async (c) => {
  const body = await c.req.json<{ query: string; limit?: number }>();
  const registry = new MarketplaceRegistry();
  await registry.init();
  const search = new MarketplaceSearch(registry);
  search.loadSummaryIndex();
  const results = await search.search(body.query, body.limit ?? 10);
  registry.close();
  return c.json({
    query: body.query,
    results: results.map((r) => ({
      ...r.listing,
      score: r.score,
      matchType: r.matchType,
    })),
    count: results.length,
  });
});

app.post("/agent/task", async (c) => {
  const body = await c.req.json<{
    task: string;
    maxSteps?: number;
    budgetMon?: number;
  }>();
  const agent = new AutonomousAgent();
  const result = await agent.runTask(body.task, {
    maxSteps: body.maxSteps,
    budgetMon: body.budgetMon,
  });
  return c.json(result);
});

// === Server ===

export function startServer(port: number = 3001): void {
  serve({ fetch: app.fetch, port }, (info) => {
    const x402Status = cfg.x402PayTo ? `Enabled (${cfg.x402Network})` : "Disabled (set X402_PAY_TO to enable)";
    const moltbookStatus = cfg.moltbookApiKey ? `Enabled (${cfg.moltbookDefaultSubmolt})` : "Disabled (set MOLTBOOK_API_KEY to enable)";
    console.log(`\nMemory Markets`);
    console.log(`  Dashboard: http://localhost:${info.port}`);
    console.log(`  API:       http://localhost:${info.port}/api`);
    console.log(`  Agent SSE: POST http://localhost:${info.port}/api/agent/task/stream`);
    console.log(`  X402:      ${x402Status}`);
    console.log(`  Moltbook:  ${moltbookStatus}\n`);
  });
}

export { app };
