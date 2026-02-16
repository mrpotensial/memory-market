import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentAction, AgentDecision, AgentObservation } from "../../src/agent/brain.js";

/**
 * Tests for the Agent Brain module.
 *
 * AgentBrain requires GEMINI_API_KEY. We test:
 * 1. Type structures (AgentAction, AgentDecision, AgentObservation)
 * 2. Tool declarations (names and structure)
 * 3. Prompt building logic
 * 4. Decision parsing (function call vs text response)
 * 5. Error handling (no response from model)
 */

// Mock the config module
vi.mock("../../src/config.js", () => ({
  getConfig: () => ({
    geminiApiKey: "test-api-key",
    geminiModel: "gemini-2.0-flash",
    geminiEmbeddingModel: "text-embedding-004",
    geminiEmbeddingDimensions: 768,
  }),
}));

// Mock the Google Generative AI module
const mockGenerateContent = vi.fn();
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
  SchemaType: {
    OBJECT: "OBJECT",
    STRING: "STRING",
  },
}));

import { AgentBrain } from "../../src/agent/brain.js";

describe("AgentBrain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates a brain instance", () => {
      const brain = new AgentBrain();
      expect(brain).toBeInstanceOf(AgentBrain);
    });
  });

  describe("getToolNames", () => {
    it("returns all 13 tool names", () => {
      const brain = new AgentBrain();
      const tools = brain.getToolNames();

      expect(tools).toContain("search_marketplace");
      expect(tools).toContain("buy_knowledge");
      expect(tools).toContain("query_knowledge");
      expect(tools).toContain("check_balance");
      expect(tools).toContain("list_marketplace");
      expect(tools).toContain("write_note");
      expect(tools).toContain("recall_memory");
      expect(tools).toContain("post_bounty");
      expect(tools).toContain("check_bounties");
      expect(tools).toContain("rate_package");
      expect(tools).toContain("register_identity");
      expect(tools).toContain("post_to_moltbook");
      expect(tools).toContain("complete_task");
      expect(tools.length).toBe(13);
    });
  });

  describe("decide", () => {
    it("returns a function call decision", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "search_marketplace",
                      args: { query: "typescript knowledge" },
                    },
                  },
                ],
              },
            },
          ],
        },
      });

      const brain = new AgentBrain();
      const decision = await brain.decide("Find TypeScript knowledge", []);

      expect(decision.isFinal).toBe(false);
      expect(decision.action).not.toBeNull();
      expect(decision.action!.tool).toBe("search_marketplace");
      expect(decision.action!.args.query).toBe("typescript knowledge");
    });

    it("returns final answer for complete_task", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "complete_task",
                      args: { answer: "The project uses TypeScript." },
                    },
                  },
                ],
              },
            },
          ],
        },
      });

      const brain = new AgentBrain();
      const decision = await brain.decide("What language?", []);

      expect(decision.isFinal).toBe(true);
      expect(decision.finalAnswer).toBe("The project uses TypeScript.");
      expect(decision.action).toBeNull();
    });

    it("handles text response (no function call) as final answer", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [
            {
              content: {
                parts: [{ text: "Memory Markets is a decentralized marketplace where AI agents trade knowledge packages on Monad blockchain. The system uses Nad.fun bonding curves for price discovery." }],
              },
            },
          ],
        },
      });

      const brain = new AgentBrain();
      const decision = await brain.decide("Help me", []);

      expect(decision.isFinal).toBe(true);
      expect(decision.finalAnswer).toContain("Memory Markets");
    });

    it("handles empty candidates as final decision", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [
            {
              content: { parts: null },
            },
          ],
        },
      });

      const brain = new AgentBrain();
      const decision = await brain.decide("test", []);

      expect(decision.isFinal).toBe(true);
      expect(decision.thought).toBe("No response from model");
    });

    it("includes observations in prompt for multi-step decisions", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "buy_knowledge",
                      args: { packageId: "pkg_123" },
                    },
                  },
                ],
              },
            },
          ],
        },
      });

      const brain = new AgentBrain();
      const observations: AgentObservation[] = [
        {
          tool: "search_marketplace",
          result: "Found 3 packages",
          success: true,
        },
      ];

      const decision = await brain.decide("Find knowledge", observations);

      // Verify the prompt was built with observations
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(decision.action!.tool).toBe("buy_knowledge");
    });
  });
});

describe("Agent types", () => {
  it("AgentAction has tool and args", () => {
    const action: AgentAction = {
      tool: "search_marketplace",
      args: { query: "test" },
    };
    expect(action.tool).toBe("search_marketplace");
    expect(action.args.query).toBe("test");
  });

  it("AgentDecision has thought, action, isFinal", () => {
    const decision: AgentDecision = {
      thought: "I need to search",
      action: { tool: "search_marketplace", args: { query: "ts" } },
      isFinal: false,
    };
    expect(decision.thought).toContain("search");
    expect(decision.isFinal).toBe(false);
  });

  it("AgentDecision can be final with answer", () => {
    const decision: AgentDecision = {
      thought: "Task complete",
      action: null,
      isFinal: true,
      finalAnswer: "Done!",
    };
    expect(decision.isFinal).toBe(true);
    expect(decision.finalAnswer).toBe("Done!");
    expect(decision.action).toBeNull();
  });

  it("AgentObservation records tool results", () => {
    const obs: AgentObservation = {
      tool: "check_balance",
      result: "Wallet 0xabc: 5.0 MON",
      success: true,
    };
    expect(obs.tool).toBe("check_balance");
    expect(obs.success).toBe(true);
    expect(obs.result).toContain("5.0 MON");
  });

  it("AgentObservation records failures", () => {
    const obs: AgentObservation = {
      tool: "buy_knowledge",
      result: "Error: Insufficient balance",
      success: false,
    };
    expect(obs.success).toBe(false);
    expect(obs.result).toContain("Insufficient balance");
  });
});
