import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { rmSync, existsSync, readFileSync } from "fs";
import {
  loadMemory,
  saveMemory,
  addPurchase,
  addQuery,
  addNote,
  recordTaskCompletion,
  getRelevantMemory,
  getReputationSummary,
  type AgentMemory,
} from "../../src/agent/memory.js";

describe("Agent Memory", () => {
  const testMemPath = join(import.meta.dirname, "__test_memory__.json");

  beforeEach(() => {
    rmSync(testMemPath, { force: true });
  });

  afterEach(() => {
    rmSync(testMemPath, { force: true });
  });

  describe("loadMemory", () => {
    it("returns empty memory when no file exists", () => {
      const memory = loadMemory(testMemPath);

      expect(memory.agentId).toMatch(/^agent-/);
      expect(memory.purchasedPackages).toEqual([]);
      expect(memory.queryHistory).toEqual([]);
      expect(memory.notes).toEqual([]);
      expect(memory.reputation.level).toBe("novice");
      expect(memory.reputation.tasksCompleted).toBe(0);
    });

    it("loads saved memory from file", () => {
      const original = loadMemory(testMemPath);
      original.agentId = "agent-test123";
      addNote(original, "This is a test note");
      saveMemory(original, testMemPath);

      const loaded = loadMemory(testMemPath);
      expect(loaded.agentId).toBe("agent-test123");
      expect(loaded.notes.length).toBe(1);
      expect(loaded.notes[0]).toContain("test note");
    });

    it("handles corrupted memory file gracefully", () => {
      const { writeFileSync, mkdirSync } = require("fs");
      const { dirname } = require("path");
      mkdirSync(dirname(testMemPath), { recursive: true });
      writeFileSync(testMemPath, "not valid json!!!", "utf-8");

      const memory = loadMemory(testMemPath);
      expect(memory.agentId).toMatch(/^agent-/);
      expect(memory.purchasedPackages).toEqual([]);
    });

    it("handles incomplete memory structure gracefully", () => {
      const { writeFileSync, mkdirSync } = require("fs");
      const { dirname } = require("path");
      mkdirSync(dirname(testMemPath), { recursive: true });
      writeFileSync(testMemPath, JSON.stringify({ foo: "bar" }), "utf-8");

      const memory = loadMemory(testMemPath);
      // Should return fresh memory since structure is invalid
      expect(memory.agentId).toMatch(/^agent-/);
      expect(memory.purchasedPackages).toEqual([]);
    });
  });

  describe("saveMemory", () => {
    it("persists memory to disk", () => {
      const memory = loadMemory(testMemPath);
      memory.agentId = "agent-persist";
      saveMemory(memory, testMemPath);

      expect(existsSync(testMemPath)).toBe(true);
      const raw = JSON.parse(readFileSync(testMemPath, "utf-8"));
      expect(raw.agentId).toBe("agent-persist");
    });

    it("updates lastActive timestamp on save", () => {
      const memory = loadMemory(testMemPath);
      // Set an old date to ensure it changes
      memory.lastActive = "2020-01-01T00:00:00.000Z";
      saveMemory(memory, testMemPath);

      const loaded = loadMemory(testMemPath);
      expect(loaded.lastActive).not.toBe("2020-01-01T00:00:00.000Z");
      expect(new Date(loaded.lastActive).getFullYear()).toBeGreaterThanOrEqual(2025);
    });
  });

  describe("addPurchase", () => {
    it("records a purchase with timestamp", () => {
      const memory = loadMemory(testMemPath);
      addPurchase(memory, {
        id: "pkg-001",
        name: "TypeScript Knowledge",
        price: 1.5,
        txHash: "0xabc123",
      });

      expect(memory.purchasedPackages.length).toBe(1);
      expect(memory.purchasedPackages[0].id).toBe("pkg-001");
      expect(memory.purchasedPackages[0].name).toBe("TypeScript Knowledge");
      expect(memory.purchasedPackages[0].price).toBe(1.5);
      expect(memory.purchasedPackages[0].timestamp).toBeTruthy();
    });

    it("updates reputation after purchase", () => {
      const memory = loadMemory(testMemPath);
      addPurchase(memory, {
        id: "pkg-001",
        name: "Test",
        price: 2.0,
        txHash: "0x111",
      });

      expect(memory.reputation.knowledgeBought).toBe(1);
      expect(memory.reputation.totalMonSpent).toBe(2.0);
    });

    it("tracks multiple purchases", () => {
      const memory = loadMemory(testMemPath);

      addPurchase(memory, { id: "p1", name: "A", price: 1, txHash: "0x1" });
      addPurchase(memory, { id: "p2", name: "B", price: 2, txHash: "0x2" });
      addPurchase(memory, { id: "p3", name: "C", price: 0.5, txHash: "0x3" });

      expect(memory.purchasedPackages.length).toBe(3);
      expect(memory.reputation.knowledgeBought).toBe(3);
      expect(memory.reputation.totalMonSpent).toBe(3.5);
    });
  });

  describe("addQuery", () => {
    it("records a query with timestamp", () => {
      const memory = loadMemory(testMemPath);
      addQuery(memory, {
        question: "How does viem work?",
        answer: "viem is a TypeScript library for Ethereum",
        source: "docs.ts:10-20",
      });

      expect(memory.queryHistory.length).toBe(1);
      expect(memory.queryHistory[0].question).toBe("How does viem work?");
      expect(memory.queryHistory[0].timestamp).toBeTruthy();
    });

    it("limits query history to 100 entries", () => {
      const memory = loadMemory(testMemPath);

      for (let i = 0; i < 110; i++) {
        addQuery(memory, {
          question: `Question ${i}`,
          answer: `Answer ${i}`,
          source: "test",
        });
      }

      expect(memory.queryHistory.length).toBe(100);
      // Should keep the most recent entries
      expect(memory.queryHistory[99].question).toBe("Question 109");
    });
  });

  describe("addNote", () => {
    it("adds timestamped note", () => {
      const memory = loadMemory(testMemPath);
      addNote(memory, "Remember to check TypeScript packages");

      expect(memory.notes.length).toBe(1);
      expect(memory.notes[0]).toContain("Remember to check TypeScript");
      expect(memory.notes[0]).toMatch(/^\[.*\]/); // Has timestamp prefix
    });

    it("limits notes to 50 entries", () => {
      const memory = loadMemory(testMemPath);

      for (let i = 0; i < 60; i++) {
        addNote(memory, `Note ${i}`);
      }

      expect(memory.notes.length).toBe(50);
      expect(memory.notes[49]).toContain("Note 59");
    });
  });

  describe("recordTaskCompletion", () => {
    it("increments tasks completed", () => {
      const memory = loadMemory(testMemPath);
      expect(memory.reputation.tasksCompleted).toBe(0);

      recordTaskCompletion(memory);
      expect(memory.reputation.tasksCompleted).toBe(1);

      recordTaskCompletion(memory);
      expect(memory.reputation.tasksCompleted).toBe(2);
    });
  });

  describe("reputation levels", () => {
    it("starts as novice", () => {
      const memory = loadMemory(testMemPath);
      expect(memory.reputation.level).toBe("novice");
    });

    it("becomes trader after activity", () => {
      const memory = loadMemory(testMemPath);

      // Score needs >= 5: tasks*2 + buys*3 + sells*5
      // 1 task (2) + 1 buy (3) = 5 → trader
      recordTaskCompletion(memory);
      addPurchase(memory, { id: "p1", name: "A", price: 1, txHash: "0x1" });

      expect(memory.reputation.level).toBe("trader");
    });

    it("becomes expert after significant activity", () => {
      const memory = loadMemory(testMemPath);

      // Score >= 20: need 10 tasks (20) or 4 tasks + 4 buys (8+12=20)
      for (let i = 0; i < 4; i++) {
        recordTaskCompletion(memory);
        addPurchase(memory, { id: `p${i}`, name: `Pkg${i}`, price: 1, txHash: `0x${i}` });
      }

      expect(memory.reputation.level).toBe("expert");
    });

    it("becomes whale after heavy activity", () => {
      const memory = loadMemory(testMemPath);

      // Score >= 50: need 10 tasks + 10 buys = 20 + 30 = 50
      for (let i = 0; i < 10; i++) {
        recordTaskCompletion(memory);
        addPurchase(memory, { id: `p${i}`, name: `Pkg${i}`, price: 1, txHash: `0x${i}` });
      }

      expect(memory.reputation.level).toBe("whale");
    });
  });

  describe("getRelevantMemory", () => {
    it("returns formatted memory string", () => {
      const memory = loadMemory(testMemPath);
      addPurchase(memory, { id: "p1", name: "TS Docs", price: 1, txHash: "0xabc" });
      addNote(memory, "TypeScript is great");

      const result = getRelevantMemory(memory, "TypeScript knowledge");

      expect(result).toContain("Agent ID:");
      expect(result).toContain("NOVICE");
      expect(result).toContain("TS Docs");
      expect(result).toContain("TypeScript is great");
    });

    it("filters queries by task relevance", () => {
      const memory = loadMemory(testMemPath);
      addQuery(memory, { question: "How does blockchain work?", answer: "It's a ledger", source: "docs" });
      addQuery(memory, { question: "What is TypeScript?", answer: "A typed superset", source: "ts.md" });

      const result = getRelevantMemory(memory, "blockchain development");

      expect(result).toContain("blockchain");
      // TypeScript query should not match "blockchain development"
    });

    it("shows preferences", () => {
      const memory = loadMemory(testMemPath);
      memory.preferences.preferredTopics = ["solidity", "defi"];
      memory.preferences.maxPriceWilling = 3;

      const result = getRelevantMemory(memory, "any task");

      expect(result).toContain("solidity, defi");
      expect(result).toContain("3 MON");
    });
  });

  describe("getReputationSummary", () => {
    it("returns one-line summary with emoji", () => {
      const memory = loadMemory(testMemPath);
      const summary = getReputationSummary(memory);

      expect(summary).toContain("NOVICE");
      expect(summary).toContain("0 tasks");
      expect(summary).toContain("0 buys");
    });
  });

  describe("cross-session persistence", () => {
    it("memory survives save/load cycles", () => {
      // Session 1: create memory, add data
      const memory1 = loadMemory(testMemPath);
      addPurchase(memory1, { id: "p1", name: "Session1 Pkg", price: 1, txHash: "0x1" });
      addNote(memory1, "From session 1");
      recordTaskCompletion(memory1);
      saveMemory(memory1, testMemPath);

      // Session 2: load, verify, add more
      const memory2 = loadMemory(testMemPath);
      expect(memory2.purchasedPackages.length).toBe(1);
      expect(memory2.purchasedPackages[0].name).toBe("Session1 Pkg");
      expect(memory2.notes.length).toBe(1);
      expect(memory2.reputation.tasksCompleted).toBe(1);

      addPurchase(memory2, { id: "p2", name: "Session2 Pkg", price: 2, txHash: "0x2" });
      saveMemory(memory2, testMemPath);

      // Session 3: verify all data
      const memory3 = loadMemory(testMemPath);
      expect(memory3.purchasedPackages.length).toBe(2);
      expect(memory3.reputation.knowledgeBought).toBe(2);
      expect(memory3.reputation.totalMonSpent).toBe(3);
    });
  });
});
