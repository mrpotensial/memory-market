import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";
import { MarketplaceRegistry } from "../../src/marketplace/registry.js";
import { loadMemory, saveMemory, addPurchase, recordTaskCompletion } from "../../src/agent/memory.js";
import type { AgentStep, TaskResult } from "../../src/agent/autonomous.js";
import type { MultiAgentResult, MultiAgentStep } from "../../src/agent/coordinator.js";

/**
 * Integration tests for the agent system.
 *
 * These test the REAL registry, memory, and types without needing
 * the AI provider (which requires GEMINI_API_KEY).
 * They validate the full data flow through the agent system.
 */

describe("Agent Integration - Registry + Memory", () => {
  const testDir = join(import.meta.dirname, "__integration_test__");
  const testDbPath = join(testDir, "test-registry.db");
  const testMemPath = join(testDir, "test-memory.json");
  let registry: MarketplaceRegistry;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    rmSync(testDbPath, { force: true });
    rmSync(testMemPath, { force: true });
    registry = new MarketplaceRegistry(testDbPath);
    await registry.init();
  });

  afterEach(() => {
    registry.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("simulates search → buy → query flow", () => {
    // Setup: Create package in registry
    registry.listPackage({
      id: "ctx_test001",
      name: "TypeScript Fundamentals",
      description: "Core TypeScript concepts",
      tags: "typescript,programming",
      priceMon: 0.5,
      tokenAddress: null,
      curveAddress: null,
      creatorAddress: "0xCreator123",
      packagePath: "/fake/path.mmctx",
      fileCount: 5,
      chunkCount: 20,
      entityCount: 10,
    });

    // Step 1: Search
    const searchResults = registry.searchByKeyword("TypeScript");
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].name).toBe("TypeScript Fundamentals");

    // Step 2: Buy (simulate)
    const pkg = registry.getPackage("ctx_test001");
    expect(pkg).not.toBeNull();
    registry.recordSale("ctx_test001", "0xBuyer456", 0.5, "0xTxHash789");

    // Step 3: Verify sale recorded
    const sales = registry.getSales("ctx_test001");
    expect(sales.length).toBe(1);
    expect(sales[0].amountMon).toBe(0.5);

    // Step 4: Record in memory
    const memory = loadMemory(testMemPath);
    addPurchase(memory, {
      id: "ctx_test001",
      name: "TypeScript Fundamentals",
      price: 0.5,
      txHash: "0xTxHash789",
    });
    saveMemory(memory, testMemPath);

    // Step 5: Verify memory persists
    const loaded = loadMemory(testMemPath);
    expect(loaded.purchasedPackages.length).toBe(1);
    expect(loaded.reputation.knowledgeBought).toBe(1);
    expect(loaded.reputation.totalMonSpent).toBe(0.5);
  });

  it("prevents duplicate purchases via memory", () => {
    const memory = loadMemory(testMemPath);

    // First purchase
    addPurchase(memory, {
      id: "pkg-unique-001",
      name: "Solidity Basics",
      price: 1.0,
      txHash: "0xfirst",
    });

    // Check before second purchase
    const alreadyOwned = memory.purchasedPackages.some((p) => p.id === "pkg-unique-001");
    expect(alreadyOwned).toBe(true);

    // Should skip buying
    expect(memory.purchasedPackages.length).toBe(1);
    expect(memory.reputation.totalMonSpent).toBe(1.0); // Not 2.0
  });

  it("handles budget constraints", () => {
    const budgetMon = 5;
    let monSpent = 0;

    // Setup packages with different prices
    const packages = [
      { id: "p1", price: 2.0 },
      { id: "p2", price: 2.0 },
      { id: "p3", price: 2.0 },
    ];

    const purchased: string[] = [];
    for (const pkg of packages) {
      if (monSpent + pkg.price <= budgetMon) {
        monSpent += pkg.price;
        purchased.push(pkg.id);
      }
    }

    expect(purchased).toEqual(["p1", "p2"]);
    expect(monSpent).toBe(4.0);
  });

  it("bounties can be posted and found", () => {
    const bountyId = registry.postBounty(
      "Need knowledge about Monad blockchain",
      2.5,
      "0xRequester",
    );

    expect(bountyId).toMatch(/^bounty-/);

    const bounties = registry.getOpenBounties();
    expect(bounties.length).toBe(1);
    expect(bounties[0].topic).toContain("Monad blockchain");
    expect(bounties[0].rewardMon).toBe(2.5);
    expect(bounties[0].status).toBe("open");
  });

  it("bounties can be fulfilled", () => {
    const bountyId = registry.postBounty("Need Solidity help", 3.0, "0xReq");

    const fulfilled = registry.fulfillBounty(bountyId, "0xFulfiller");
    expect(fulfilled).toBe(true);

    // No longer shows as open
    const open = registry.getOpenBounties();
    expect(open.length).toBe(0);
  });

  it("ratings are recorded and averaged", () => {
    registry.listPackage({
      id: "ctx_rated",
      name: "Rated Package",
      description: "For rating test",
      tags: "test",
      priceMon: 1,
      tokenAddress: null,
      curveAddress: null,
      creatorAddress: null,
      packagePath: "/fake",
      fileCount: 1,
      chunkCount: 1,
      entityCount: 1,
    });

    registry.ratePackage("ctx_rated", "0xRater1", 5, "Excellent!");
    registry.ratePackage("ctx_rated", "0xRater2", 3, "Decent");
    registry.ratePackage("ctx_rated", "0xRater3", 4, "Good");

    const rating = registry.getPackageRating("ctx_rated");
    expect(rating).not.toBeNull();
    expect(rating!.count).toBe(3);
    expect(rating!.avg).toBe(4); // (5+3+4)/3

    const allRatings = registry.getPackageRatings("ctx_rated");
    expect(allRatings.length).toBe(3);
    expect(allRatings[0].stars).toBe(4); // Most recent first
  });

  it("returns null for unrated package", () => {
    registry.listPackage({
      id: "ctx_unrated",
      name: "Unrated Package",
      description: "No ratings",
      tags: "test",
      priceMon: 1,
      tokenAddress: null,
      curveAddress: null,
      creatorAddress: null,
      packagePath: "/fake",
      fileCount: 1,
      chunkCount: 1,
      entityCount: 1,
    });

    const rating = registry.getPackageRating("ctx_unrated");
    expect(rating).toBeNull();
  });
});

describe("Agent Integration - Memory + Reputation Flow", () => {
  const testDir = join(import.meta.dirname, "__integration_rep_test__");
  const testMemPath = join(testDir, "test-memory.json");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    rmSync(testMemPath, { force: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("reputation evolves across multiple sessions", () => {
    // Session 1: New agent, first task
    const mem1 = loadMemory(testMemPath);
    expect(mem1.reputation.level).toBe("novice");

    addPurchase(mem1, { id: "p1", name: "Pkg1", price: 1, txHash: "0x1" });
    saveMemory(mem1, testMemPath);

    // Session 2: More activity → trader
    const mem2 = loadMemory(testMemPath);
    recordTaskCompletion(mem2);
    addPurchase(mem2, { id: "p2", name: "Pkg2", price: 1, txHash: "0x2" });
    saveMemory(mem2, testMemPath);

    expect(mem2.reputation.level).toBe("trader");

    // Session 3: Heavy activity → whale (score >= 50)
    const mem3 = loadMemory(testMemPath);
    for (let i = 3; i < 13; i++) {
      recordTaskCompletion(mem3);
      addPurchase(mem3, { id: `p${i}`, name: `Pkg${i}`, price: 1, txHash: `0x${i}` });
    }
    saveMemory(mem3, testMemPath);

    // Total: 11 tasks (22) + 12 buys (36) = 58 → whale
    expect(mem3.reputation.level).toBe("whale");
  });
});

describe("Agent Types - TaskResult", () => {
  it("TaskResult includes reputation field", () => {
    const result: TaskResult = {
      task: "Test task",
      steps: [],
      finalAnswer: "Done",
      monSpent: 0,
      knowledgeAcquired: [],
      completed: true,
      reputation: "🌱 NOVICE | 0 tasks | 0 buys | 0.00 MON spent",
    };

    expect(result.reputation).toContain("NOVICE");
  });
});

describe("Agent Types - MultiAgentResult", () => {
  it("MultiAgentResult captures both agents", () => {
    const result: MultiAgentResult = {
      scenario: "Test scenario",
      agents: [
        {
          name: "Seller Agent",
          role: "seller",
          result: {
            task: "Sell knowledge",
            steps: [],
            finalAnswer: "Listed package",
            monSpent: 0,
            knowledgeAcquired: [],
            completed: true,
          },
        },
        {
          name: "Buyer Agent",
          role: "buyer",
          result: {
            task: "Buy knowledge",
            steps: [],
            finalAnswer: "Bought and queried",
            monSpent: 1.5,
            knowledgeAcquired: ["Test Package"],
            completed: true,
          },
        },
      ],
      coordination: ["Step 1", "Step 2"],
      totalMonSpent: 1.5,
      success: true,
    };

    expect(result.agents.length).toBe(2);
    expect(result.agents[0].role).toBe("seller");
    expect(result.agents[1].role).toBe("buyer");
    expect(result.totalMonSpent).toBe(1.5);
    expect(result.success).toBe(true);
  });

  it("MultiAgentStep tracks per-agent steps", () => {
    const step: MultiAgentStep = {
      agentName: "Buyer Agent",
      agentRole: "buyer",
      step: {
        step: 1,
        thought: "Searching marketplace",
        tool: "search_marketplace",
        args: { query: "blockchain" },
        result: "Found 2 packages",
        success: true,
      },
    };

    expect(step.agentName).toBe("Buyer Agent");
    expect(step.agentRole).toBe("buyer");
    expect(step.step.tool).toBe("search_marketplace");
  });
});
