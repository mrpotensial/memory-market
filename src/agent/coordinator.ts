import { AutonomousAgent, type AgentStep, type TaskResult } from "./autonomous.js";
import { loadMemory, saveMemory, addNote } from "./memory.js";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

// === Types ===

export interface AgentRole {
  name: string;
  role: "seller" | "buyer" | "researcher";
  task: string;
}

export interface MultiAgentStep {
  agentName: string;
  agentRole: string;
  step: AgentStep;
}

export interface MultiAgentResult {
  scenario: string;
  agents: {
    name: string;
    role: string;
    result: TaskResult;
  }[];
  coordination: string[];
  totalMonSpent: number;
  success: boolean;
}

export interface MultiAgentConfig {
  maxStepsPerAgent?: number;
  budgetPerAgent?: number;
  onStep?: (step: MultiAgentStep) => void;
}

// === Coordinator ===

/**
 * Coordinates multiple agents in a shared marketplace scenario.
 * Each agent has its own memory and makes independent decisions,
 * but they share the same marketplace registry (like real blockchain state).
 */
export class AgentCoordinator {
  /**
   * Run a multi-agent scenario.
   * Currently supports: seller + buyer coordination.
   */
  async runScenario(
    scenario: string,
    config: MultiAgentConfig = {},
  ): Promise<MultiAgentResult> {
    const maxSteps = config.maxStepsPerAgent ?? 8;
    const budget = config.budgetPerAgent ?? 5;
    const coordination: string[] = [];

    // Ensure memory directories exist
    const memDir = join(homedir(), ".memory-markets", "agents");
    mkdirSync(memDir, { recursive: true });

    const sellerMemPath = join(memDir, "seller-memory.json");
    const buyerMemPath = join(memDir, "buyer-memory.json");

    // Parse scenario to determine tasks
    const { sellerTask, buyerTask } = this.parseScenario(scenario);

    coordination.push(`Scenario: ${scenario}`);
    coordination.push(`Seller task: ${sellerTask}`);
    coordination.push(`Buyer task: ${buyerTask}`);

    // Phase 1: Seller agent acts first
    coordination.push("\n--- Phase 1: Seller Agent ---");

    const sellerAgent = new AutonomousAgent(sellerMemPath);
    const sellerSteps: AgentStep[] = [];

    const sellerResult = await sellerAgent.runTask(sellerTask, {
      maxSteps,
      budgetMon: budget,
      memoryPath: sellerMemPath,
      role: "seller",
      onStep: (step) => {
        sellerSteps.push(step);
        config.onStep?.({
          agentName: "Seller Agent",
          agentRole: "seller",
          step,
        });
        coordination.push(`[Seller] Step ${step.step}: ${step.tool ?? "thinking"} → ${step.result.slice(0, 100)}`);
      },
    });

    // Seller writes a note about what they sold
    const sellerMemory = loadMemory(sellerMemPath);
    addNote(sellerMemory, `Completed seller task: "${sellerTask}". Knowledge acquired: ${sellerResult.knowledgeAcquired.join(", ") || "none"}`);
    saveMemory(sellerMemory, sellerMemPath);

    // Phase 2: Buyer agent acts second (marketplace now has seller's packages)
    coordination.push("\n--- Phase 2: Buyer Agent ---");

    const buyerAgent = new AutonomousAgent(buyerMemPath);
    const buyerSteps: AgentStep[] = [];

    const buyerResult = await buyerAgent.runTask(buyerTask, {
      maxSteps,
      budgetMon: budget,
      memoryPath: buyerMemPath,
      role: "buyer",
      onStep: (step) => {
        buyerSteps.push(step);
        config.onStep?.({
          agentName: "Buyer Agent",
          agentRole: "buyer",
          step,
        });
        coordination.push(`[Buyer] Step ${step.step}: ${step.tool ?? "thinking"} → ${step.result.slice(0, 100)}`);
      },
    });

    // Buyer writes a note
    const buyerMemory = loadMemory(buyerMemPath);
    addNote(buyerMemory, `Completed buyer task: "${buyerTask}". Purchased: ${buyerResult.knowledgeAcquired.join(", ") || "none"}`);
    saveMemory(buyerMemory, buyerMemPath);

    // Summary
    const totalMon = sellerResult.monSpent + buyerResult.monSpent;
    const success = sellerResult.completed && buyerResult.completed;

    coordination.push("\n--- Summary ---");
    coordination.push(`Seller completed: ${sellerResult.completed}`);
    coordination.push(`Buyer completed: ${buyerResult.completed}`);
    coordination.push(`Total MON spent: ${totalMon}`);
    coordination.push(`Knowledge transferred: ${buyerResult.knowledgeAcquired.join(", ") || "none"}`);

    return {
      scenario,
      agents: [
        { name: "Seller Agent", role: "seller", result: sellerResult },
        { name: "Buyer Agent", role: "buyer", result: buyerResult },
      ],
      coordination,
      totalMonSpent: totalMon,
      success,
    };
  }

  /** Parse a free-form scenario into specific agent tasks */
  private parseScenario(scenario: string): {
    sellerTask: string;
    buyerTask: string;
  } {
    const lower = scenario.toLowerCase();

    // Try to find explicit seller/buyer tasks
    if (lower.includes("sell") && lower.includes("buy")) {
      return {
        sellerTask: `You are a SELLER agent. Your job: list your knowledge on the marketplace. ${scenario}`,
        buyerTask: `You are a BUYER agent. Your job: search the marketplace, find relevant knowledge, buy it, and query it. ${scenario}`,
      };
    }

    // Default: seller lists, buyer searches and buys
    return {
      sellerTask: `You are a SELLER agent. List available packages on the marketplace and check what knowledge is available. ${scenario}`,
      buyerTask: `You are a BUYER agent. Search the marketplace for knowledge packages. If you find something relevant, buy it and query it to answer: ${scenario}`,
    };
  }
}
