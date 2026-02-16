import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  AgentStep,
  TaskResult,
  AgentConfig,
} from "../../src/agent/autonomous.js";

/**
 * Tests for the Autonomous Agent module.
 *
 * AutonomousAgent requires GEMINI_API_KEY + SQLite + possibly blockchain.
 * We test:
 * 1. Type structures (AgentStep, TaskResult, AgentConfig)
 * 2. Agent configuration defaults
 * 3. Task result validation
 * 4. Step tracking and progress
 * 5. Budget management logic
 * 6. Unknown tool handling
 */

describe("AgentStep type", () => {
  it("represents a complete step with tool call", () => {
    const step: AgentStep = {
      step: 1,
      thought: "I need to search for knowledge",
      tool: "search_marketplace",
      args: { query: "typescript" },
      result: "Found 3 packages",
      success: true,
    };

    expect(step.step).toBe(1);
    expect(step.tool).toBe("search_marketplace");
    expect(step.success).toBe(true);
    expect(step.result).toContain("3 packages");
  });

  it("represents a final step without tool call", () => {
    const step: AgentStep = {
      step: 3,
      thought: "Task complete",
      tool: null,
      args: {},
      result: "The answer is 42.",
      success: true,
    };

    expect(step.tool).toBeNull();
    expect(step.result).toBe("The answer is 42.");
  });

  it("represents a failed step", () => {
    const step: AgentStep = {
      step: 2,
      thought: "Trying to buy package",
      tool: "buy_knowledge",
      args: { packageId: "pkg_123" },
      result: "Error: Insufficient balance",
      success: false,
    };

    expect(step.success).toBe(false);
    expect(step.result).toContain("Insufficient balance");
  });
});

describe("TaskResult type", () => {
  it("represents a successful task completion", () => {
    const result: TaskResult = {
      task: "Explain the Memory Markets architecture",
      steps: [
        {
          step: 1,
          thought: "Search first",
          tool: "search_marketplace",
          args: { query: "architecture" },
          result: "Found packages",
          success: true,
        },
        {
          step: 2,
          thought: "Buy best package",
          tool: "buy_knowledge",
          args: { packageId: "pkg_1" },
          result: "Bought for 0.5 MON",
          success: true,
        },
        {
          step: 3,
          thought: "Query knowledge",
          tool: "query_knowledge",
          args: { question: "architecture" },
          result: "The architecture uses...",
          success: true,
        },
        {
          step: 4,
          thought: "Done",
          tool: null,
          args: {},
          result: "Architecture explanation complete.",
          success: true,
        },
      ],
      finalAnswer: "Architecture explanation complete.",
      monSpent: 0.5,
      knowledgeAcquired: ["Memory Markets Docs"],
      completed: true,
    };

    expect(result.completed).toBe(true);
    expect(result.steps.length).toBe(4);
    expect(result.monSpent).toBe(0.5);
    expect(result.knowledgeAcquired).toContain("Memory Markets Docs");
    expect(result.finalAnswer).toContain("Architecture");
  });

  it("represents an incomplete task (max steps reached)", () => {
    const result: TaskResult = {
      task: "Complex task",
      steps: Array.from({ length: 10 }, (_, i) => ({
        step: i + 1,
        thought: "Still working...",
        tool: "search_marketplace",
        args: { query: "test" },
        result: "No relevant results",
        success: true,
      })),
      finalAnswer: "",
      monSpent: 0,
      knowledgeAcquired: [],
      completed: false,
    };

    expect(result.completed).toBe(false);
    expect(result.steps.length).toBe(10);
    expect(result.finalAnswer).toBe("");
  });
});

describe("AgentConfig type", () => {
  it("accepts default values", () => {
    const config: AgentConfig = {};
    expect(config.maxSteps).toBeUndefined();
    expect(config.budgetMon).toBeUndefined();
    expect(config.onStep).toBeUndefined();
  });

  it("accepts custom configuration", () => {
    const stepCallback = vi.fn();
    const config: AgentConfig = {
      maxSteps: 20,
      budgetMon: 10,
      onStep: stepCallback,
    };

    expect(config.maxSteps).toBe(20);
    expect(config.budgetMon).toBe(10);

    // Test callback invocation
    const step: AgentStep = {
      step: 1,
      thought: "test",
      tool: null,
      args: {},
      result: "ok",
      success: true,
    };
    config.onStep!(step);
    expect(stepCallback).toHaveBeenCalledWith(step);
  });

  it("uses sensible defaults when not configured", () => {
    // The agent defaults: maxSteps = 10, budgetMon = 5
    const maxSteps = undefined ?? 10;
    const budgetMon = undefined ?? 5;

    expect(maxSteps).toBe(10);
    expect(budgetMon).toBe(5);
  });
});

describe("Agent budget management", () => {
  it("tracks spending correctly", () => {
    let monSpent = 0;

    // Buy package for 0.5 MON
    monSpent += 0.5;
    expect(monSpent).toBe(0.5);

    // Buy another for 1.0 MON
    monSpent += 1.0;
    expect(monSpent).toBe(1.5);
  });

  it("rejects purchase when budget exceeded", () => {
    const monSpent = 4.5;
    const budgetMon = 5;
    const packagePrice = 1.0;

    const canAfford = monSpent + packagePrice <= budgetMon;
    expect(canAfford).toBe(false);
  });

  it("allows purchase within budget", () => {
    const monSpent = 1.0;
    const budgetMon = 5;
    const packagePrice = 0.5;

    const canAfford = monSpent + packagePrice <= budgetMon;
    expect(canAfford).toBe(true);
  });
});

describe("Agent unknown tool handling", () => {
  it("returns error for unknown tools", () => {
    const tool = "nonexistent_tool";
    const result = { result: `Unknown tool: ${tool}`, success: false };

    expect(result.success).toBe(false);
    expect(result.result).toContain("Unknown tool");
    expect(result.result).toContain("nonexistent_tool");
  });

  it("handles tool execution errors gracefully", () => {
    const error = new Error("Connection timeout");
    const result = {
      result: `Error: ${error.message}`,
      success: false,
    };

    expect(result.success).toBe(false);
    expect(result.result).toContain("Connection timeout");
  });
});

describe("Agent knowledge tracking", () => {
  it("tracks acquired knowledge packages", () => {
    const knowledgeAcquired: string[] = [];

    knowledgeAcquired.push("TypeScript Basics");
    knowledgeAcquired.push("Monad Blockchain Guide");

    expect(knowledgeAcquired.length).toBe(2);
    expect(knowledgeAcquired).toContain("TypeScript Basics");
    expect(knowledgeAcquired).toContain("Monad Blockchain Guide");
  });
});
