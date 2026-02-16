import { getAIProvider } from "../ai/index.js";
import type { AIProvider, ToolDefinition } from "../ai/types.js";

// === Types ===

export interface AgentAction {
  tool: string;
  args: Record<string, unknown>;
}

export interface AgentDecision {
  thought: string;
  action: AgentAction | null;
  isFinal: boolean;
  finalAnswer?: string;
}

export interface AgentObservation {
  tool: string;
  result: string;
  success: boolean;
}

// === Tool Definitions ===

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_marketplace",
    description:
      "Search the knowledge marketplace for packages matching a query. Use this to find relevant knowledge packages.",
    parameters: {
      query: {
        type: "string",
        description: "Search query to find relevant knowledge packages",
      },
    },
    required: ["query"],
  },
  {
    name: "buy_knowledge",
    description:
      "Buy a knowledge package from the marketplace by its ID. This purchases the Nad.fun token and unlocks the knowledge.",
    parameters: {
      packageId: {
        type: "string",
        description: "The package ID to purchase",
      },
    },
    required: ["packageId"],
  },
  {
    name: "query_knowledge",
    description:
      "Ask a question against imported/active knowledge. Uses RAG to find relevant context and generate an answer.",
    parameters: {
      question: {
        type: "string",
        description: "The question to ask about the imported knowledge",
      },
    },
    required: ["question"],
  },
  {
    name: "check_balance",
    description:
      "Check the agent's wallet MON balance on Monad testnet.",
    parameters: {},
    required: [],
  },
  {
    name: "list_marketplace",
    description:
      "List all available knowledge packages on the marketplace.",
    parameters: {},
    required: [],
  },
  {
    name: "write_note",
    description:
      "Write a note to your persistent memory. This note will survive across sessions. Use this to remember important findings, strategies, or lessons learned.",
    parameters: {
      note: {
        type: "string",
        description: "The note to save to memory",
      },
    },
    required: ["note"],
  },
  {
    name: "recall_memory",
    description:
      "Search your persistent memory for past purchases, queries, and notes. Use this to avoid re-buying packages or to recall previous answers.",
    parameters: {
      query: {
        type: "string",
        description: "What to search for in memory",
      },
    },
    required: ["query"],
  },
  {
    name: "post_bounty",
    description:
      "Post a knowledge bounty — request specific knowledge and offer a MON reward. Other agents can fulfill your bounty.",
    parameters: {
      topic: {
        type: "string",
        description: "The knowledge topic you need",
      },
      rewardMon: {
        type: "number",
        description: "MON reward offered for fulfilling this bounty",
      },
    },
    required: ["topic", "rewardMon"],
  },
  {
    name: "check_bounties",
    description:
      "Check open knowledge bounties. These are requests from other agents willing to pay for specific knowledge.",
    parameters: {},
    required: [],
  },
  {
    name: "rate_package",
    description:
      "Rate a knowledge package you purchased (1-5 stars). Helps other agents evaluate quality.",
    parameters: {
      packageId: {
        type: "string",
        description: "The package ID to rate",
      },
      stars: {
        type: "number",
        description: "Rating from 1 (poor) to 5 (excellent)",
      },
      comment: {
        type: "string",
        description: "Short review comment",
      },
    },
    required: ["packageId", "stars"],
  },
  {
    name: "register_identity",
    description:
      "Register your agent identity on-chain using ERC-8004 on Monad blockchain. Creates a permanent, verifiable record. Only do this once.",
    parameters: {
      name: {
        type: "string",
        description: "Agent display name for on-chain registration",
      },
    },
    required: ["name"],
  },
  {
    name: "post_to_moltbook",
    description:
      "Post a message to Moltbook (social network for AI agents). Share your knowledge findings, marketplace activity, or insights with other agents. Only use if MOLTBOOK_API_KEY is configured.",
    parameters: {
      title: {
        type: "string",
        description: "Post title (concise, descriptive)",
      },
      content: {
        type: "string",
        description: "Post content (markdown supported). Include your findings, analysis, or knowledge summary.",
      },
    },
    required: ["title", "content"],
  },
  {
    name: "complete_task",
    description:
      "Call this when the task is complete and you have a final answer. Provide the final answer/result.",
    parameters: {
      answer: {
        type: "string",
        description: "The final answer or result of the task",
      },
    },
    required: ["answer"],
  },
];

// === Agent Brain ===

/**
 * AI decision engine powered by the configured AI provider.
 * Uses function calling to decide which tools to use.
 * Now supports persistent memory and enhanced reasoning.
 */
export class AgentBrain {
  private provider: AIProvider;
  private memoryContext: string = "";

  constructor() {
    this.provider = getAIProvider();
  }

  /** Set memory context that will be included in every prompt */
  setMemoryContext(context: string): void {
    this.memoryContext = context;
  }

  /**
   * Decide the next action given a task and observation history.
   */
  async decide(
    task: string,
    observations: AgentObservation[],
  ): Promise<AgentDecision> {
    const prompt = this.buildPrompt(task, observations);

    const result = await this.provider.generateWithTools(prompt, TOOL_DEFINITIONS, {
      temperature: 0.4,
      maxTokens: 1024,
    });

    if (result.type === "function_call" && result.functionName) {
      if (result.functionName === "complete_task") {
        return {
          thought: "Task complete.",
          action: null,
          isFinal: true,
          finalAnswer: (result.functionArgs?.answer as string) ?? "Task completed.",
        };
      }

      return {
        thought: `Deciding to use tool: ${result.functionName}`,
        action: {
          tool: result.functionName,
          args: result.functionArgs ?? {},
        },
        isFinal: false,
      };
    }

    // Text response — only accept structured function_call format above.
    // Do NOT attempt to parse tool calls from free text (unsafe, fragile).
    const text = result.text ?? "";

    // Check if this looks like incomplete thinking rather than a real final answer
    // (contains phrases indicating the agent wants to continue)
    const thinkingPatterns = [
      "I will", "I'll", "I should", "let me", "next step",
      "I need to", "going to", "first", "then I", "before I",
    ];
    const looksLikeThinking = thinkingPatterns.some(
      (p) => text.toLowerCase().includes(p.toLowerCase()),
    ) && text.length < 500;

    if (looksLikeThinking && observations.length < 6) {
      // Re-interpret as a non-final step — let the agent continue
      return {
        thought: text.slice(0, 200),
        action: null,
        isFinal: false,
      };
    }

    // Genuine final answer
    return {
      thought: text || "No response",
      action: null,
      isFinal: true,
      finalAnswer: text || "Unable to process the task.",
    };
  }

  private buildPrompt(
    task: string,
    observations: AgentObservation[],
  ): string {
    let prompt = `You are an autonomous AI agent operating in Memory Markets — a decentralized knowledge marketplace on Monad blockchain.

You have a crypto wallet on Monad testnet and can trade knowledge packages. Each package contains structured knowledge (entities, relationships, embeddings) extracted from codebases and documentation.

You have PERSISTENT MEMORY that survives across sessions. Use write_note to remember important things. Use recall_memory to search your past experience.

You can register your on-chain identity via ERC-8004 on Monad using register_identity. This creates a permanent, verifiable agent record on the blockchain.

`;

    // Add memory context if available
    if (this.memoryContext) {
      prompt += `=== YOUR MEMORY ===
${this.memoryContext}
=== END MEMORY ===

`;
    }

    prompt += `Your task: ${task}

Strategy:
1. First, recall_memory to check if you've seen this before
2. Search the marketplace for relevant knowledge (try different keywords if first search fails)
3. If search returns no results, use list_marketplace to see ALL available packages — there may be a general knowledge package that covers your topic
4. Check your balance before buying
5. Buy the most relevant package (consider cost vs. value). If any package exists that could be remotely relevant, BUY IT — it's better to try than to skip
6. Query the knowledge to answer the task
7. Rate the package based on answer quality
8. Write a note about what you learned
9. If Moltbook is configured, post_to_moltbook to share your findings with other agents
10. Call complete_task with your final answer

Available tools: search_marketplace, buy_knowledge, query_knowledge, check_balance, list_marketplace, write_note, recall_memory, post_bounty, check_bounties, rate_package, register_identity, post_to_moltbook, complete_task

CRITICAL RULES:
- ALWAYS try list_marketplace before posting a bounty — there may be a relevant package you missed
- Only post_bounty as a LAST RESORT after listing AND searching the marketplace and finding truly nothing useful
- If there's ANY package on the marketplace, try buying the closest match and querying it
- Don't re-buy packages you already own (check memory first)
- Rate packages after querying to help other agents
- Write notes for your future self

`;

    if (observations.length > 0) {
      prompt += "Previous actions and results:\n\n";
      for (const obs of observations) {
        prompt += `Tool: ${obs.tool}\n`;
        prompt += `Result (${obs.success ? "success" : "failed"}): ${obs.result}\n\n`;
      }
      prompt += "Based on the above results, decide your next action.\n";
    } else {
      prompt += "This is your first step. Start by checking your memory, then search the marketplace.\n";
    }

    return prompt;
  }

  /** Get the list of available tool names */
  getToolNames(): string[] {
    return TOOL_DEFINITIONS.map((t) => t.name);
  }
}
