import { AgentBrain, type AgentObservation, type AgentDecision } from "./brain.js";
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
} from "./memory.js";
import { MarketplaceRegistry } from "../marketplace/registry.js";
import { MarketplaceSearch } from "../marketplace/search.js";
import { ContextImporter } from "../context/importer.js";
import { getActiveWallet, getBalance } from "../blockchain/wallet.js";
import { NadFunClient } from "../blockchain/nadfun.js";
import { sendPayment } from "../blockchain/payment.js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Address } from "viem";

// === Types ===

export interface AgentStep {
  step: number;
  thought: string;
  tool: string | null;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
}

export interface TaskResult {
  task: string;
  steps: AgentStep[];
  finalAnswer: string;
  monSpent: number;
  knowledgeAcquired: string[];
  completed: boolean;
  reputation?: string;
}

export interface AgentConfig {
  maxSteps?: number;
  budgetMon?: number;
  onStep?: (step: AgentStep) => void;
  /** Override memory path for testing */
  memoryPath?: string;
  /** Agent role label (for multi-agent scenarios) */
  role?: string;
}

// === Autonomous Agent ===

/**
 * Autonomous agent that can search, buy, and query knowledge packages.
 * Uses the AgentBrain (Gemini) for decision making and executes tools.
 * Now with persistent memory and enhanced tools.
 */
export class AutonomousAgent {
  private brain: AgentBrain;
  private registry: MarketplaceRegistry;
  private importer: ContextImporter | null = null;
  private monSpent = 0;
  private knowledgeAcquired: string[] = [];
  private memory: AgentMemory;
  private memoryPath?: string;

  constructor(memoryPath?: string) {
    this.brain = new AgentBrain();
    this.registry = new MarketplaceRegistry();
    this.memoryPath = memoryPath;
    this.memory = loadMemory(memoryPath);
  }

  /**
   * Run a task autonomously.
   * The agent will decide what tools to use and when to stop.
   */
  async runTask(
    task: string,
    config: AgentConfig = {},
  ): Promise<TaskResult> {
    const maxSteps = config.maxSteps ?? 10;
    const budgetMon = config.budgetMon ?? 5;

    await this.registry.init();

    // Load memory and inject into brain
    this.memory = loadMemory(config.memoryPath ?? this.memoryPath);
    const memoryContext = getRelevantMemory(this.memory, task);
    this.brain.setMemoryContext(memoryContext);

    const steps: AgentStep[] = [];
    const observations: AgentObservation[] = [];
    let finalAnswer = "";
    let completed = false;

    for (let i = 0; i < maxSteps; i++) {
      // Get decision from brain
      const decision = await this.brain.decide(task, observations);

      if (decision.isFinal) {
        finalAnswer = decision.finalAnswer ?? "";
        completed = true;

        const step: AgentStep = {
          step: i + 1,
          thought: decision.thought,
          tool: null,
          args: {},
          result: finalAnswer,
          success: true,
        };
        steps.push(step);
        config.onStep?.(step);
        break;
      }

      if (!decision.action) {
        // Brain returned thinking but no action — add as observation to re-prompt
        observations.push({
          tool: "thinking",
          result: decision.thought,
          success: true,
        });
        continue;
      }

      // Execute the tool
      const { tool, args } = decision.action;
      const { result, success } = await this.executeTool(tool, args, budgetMon);

      const step: AgentStep = {
        step: i + 1,
        thought: decision.thought,
        tool,
        args,
        result,
        success,
      };
      steps.push(step);
      config.onStep?.(step);

      observations.push({ tool, result, success });
    }

    // Save memory after task
    if (completed) {
      recordTaskCompletion(this.memory);
      // Update on-chain reputation (best-effort, non-blocking)
      this.updateOnChainReputation().catch(() => {});
    }
    saveMemory(this.memory, config.memoryPath ?? this.memoryPath);

    this.registry.close();

    return {
      task,
      steps,
      finalAnswer,
      monSpent: this.monSpent,
      knowledgeAcquired: this.knowledgeAcquired,
      completed,
      reputation: getReputationSummary(this.memory),
    };
  }

  /** Get current memory state (for multi-agent coordination) */
  getMemory(): AgentMemory {
    return this.memory;
  }

  /** Execute a tool and return the result */
  private async executeTool(
    tool: string,
    args: Record<string, unknown>,
    budgetMon: number,
  ): Promise<{ result: string; success: boolean }> {
    try {
      switch (tool) {
        case "search_marketplace":
          return await this.toolSearchMarketplace(args.query as string);

        case "list_marketplace":
          return await this.toolListMarketplace();

        case "buy_knowledge":
          return await this.toolBuyKnowledge(args.packageId as string, budgetMon);

        case "query_knowledge":
          return await this.toolQueryKnowledge(args.question as string);

        case "check_balance":
          return await this.toolCheckBalance();

        case "write_note":
          return this.toolWriteNote(args.note as string);

        case "recall_memory":
          return this.toolRecallMemory(args.query as string);

        case "post_bounty":
          return await this.toolPostBounty(args.topic as string, args.rewardMon as number);

        case "check_bounties":
          return await this.toolCheckBounties();

        case "rate_package":
          return await this.toolRatePackage(
            args.packageId as string,
            args.stars as number,
            (args.comment as string) ?? "",
          );

        case "register_identity":
          return await this.toolRegisterIdentity(args.name as string);

        case "post_to_moltbook":
          return await this.toolPostToMoltbook(
            args.title as string,
            args.content as string,
          );

        default:
          return { result: `Unknown tool: ${tool}`, success: false };
      }
    } catch (err) {
      return {
        result: `Error: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  }

  // === Tool Implementations ===

  private async toolSearchMarketplace(
    query: string,
  ): Promise<{ result: string; success: boolean }> {
    const search = new MarketplaceSearch(this.registry);
    search.loadSummaryIndex();
    const results = await search.search(query, 5);

    if (results.length === 0) {
      return { result: "No packages found.", success: true };
    }

    const lines = results.map(
      (r) =>
        `- ${r.listing.name} (ID: ${r.listing.id}, Price: ${r.listing.priceMon} MON, Score: ${(r.score * 100).toFixed(0)}%)`,
    );
    return {
      result: `Found ${results.length} package(s):\n${lines.join("\n")}`,
      success: true,
    };
  }

  private async toolListMarketplace(): Promise<{ result: string; success: boolean }> {
    const packages = this.registry.getAllPackages();

    if (packages.length === 0) {
      return { result: "Marketplace is empty.", success: true };
    }

    const lines = packages.map(
      (p) => {
        const rating = this.registry.getPackageRating(p.id);
        const ratingStr = rating ? ` ★${rating.avg.toFixed(1)}(${rating.count})` : "";
        return `- ${p.name} (ID: ${p.id}, Price: ${p.priceMon} MON, Files: ${p.fileCount}${ratingStr})`;
      },
    );
    return {
      result: `${packages.length} package(s) available:\n${lines.join("\n")}`,
      success: true,
    };
  }

  private async toolBuyKnowledge(
    packageId: string,
    budgetMon: number,
  ): Promise<{ result: string; success: boolean }> {
    // Check if already purchased
    const alreadyOwned = this.memory.purchasedPackages.some((p) => p.id === packageId);
    if (alreadyOwned) {
      return {
        result: `You already own package "${packageId}". Use query_knowledge to ask questions.`,
        success: true,
      };
    }

    const pkg = this.registry.getPackage(packageId);
    if (!pkg) {
      return { result: `Package "${packageId}" not found.`, success: false };
    }

    // Check budget
    if (this.monSpent + pkg.priceMon > budgetMon) {
      return {
        result: `Budget exceeded. Spent ${this.monSpent} MON, need ${pkg.priceMon} more but budget is ${budgetMon} MON.`,
        success: false,
      };
    }

    // Buy on-chain: try Nad.fun token first, then direct MON payment
    let txHash = "local";
    if (pkg.tokenAddress) {
      const w = getActiveWallet();
      if (!w) {
        return { result: "No wallet configured.", success: false };
      }

      try {
        const client = new NadFunClient(w.privateKey);
        const result = await client.buyToken(
          pkg.tokenAddress as Address,
          pkg.priceMon.toString(),
        );
        txHash = result.txHash;
      } catch (err) {
        return {
          result: `On-chain buy failed: ${err instanceof Error ? err.message : String(err)}`,
          success: false,
        };
      }
    } else if (pkg.creatorAddress && pkg.priceMon > 0) {
      // Direct MON payment to creator
      try {
        const result = await sendPayment(
          pkg.creatorAddress as Address,
          pkg.priceMon.toString(),
        );
        txHash = result.txHash;
      } catch (err) {
        // Payment failed but still allow local purchase
        txHash = "local-fallback";
      }
    }

    // Record the sale
    const w = getActiveWallet();
    this.registry.recordSale(
      packageId,
      w?.address ?? "agent",
      pkg.priceMon,
      txHash,
    );
    this.monSpent += pkg.priceMon;

    // Record in memory
    addPurchase(this.memory, {
      id: packageId,
      name: pkg.name,
      price: pkg.priceMon,
      txHash,
    });

    // Import the knowledge
    this.knowledgeAcquired.push(pkg.name);
    if (existsSync(pkg.packagePath)) {
      this.importer = new ContextImporter();
      this.importer.load(pkg.packagePath);

      // Set as active package
      const dataDir = join(homedir(), ".memory-markets");
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(
        join(dataDir, "active-package.json"),
        JSON.stringify({ path: pkg.packagePath }),
        "utf-8",
      );
    }

    return {
      result: `Bought "${pkg.name}" for ${pkg.priceMon} MON.${txHash !== "local" ? ` Tx: ${txHash}` : ""} Knowledge ready to query.`,
      success: true,
    };
  }

  private async toolQueryKnowledge(
    question: string,
  ): Promise<{ result: string; success: boolean }> {
    if (!this.importer || !this.importer.isLoaded()) {
      // Try loading from active package
      const dataDir = join(homedir(), ".memory-markets");
      const activePath = join(dataDir, "active-package.json");

      if (existsSync(activePath)) {
        try {
          const { path: pkgPath } = JSON.parse(readFileSync(activePath, "utf-8"));
          this.importer = new ContextImporter();
          this.importer.load(pkgPath);
        } catch {
          // Package files don't exist on disk — fall through to metadata-based answer
        }
      }
    }

    // If real knowledge is loaded, use RAG
    if (this.importer && this.importer.isLoaded()) {
      const result = await this.importer.query(question, 5);
      const sourceInfo = result.sources
        .map((s) => `${s.filePath}:${s.lineStart}-${s.lineEnd}`)
        .join(", ");

      addQuery(this.memory, {
        question,
        answer: result.answer,
        source: sourceInfo || "none",
      });

      return {
        result: `${result.answer}\n\nSources: ${sourceInfo || "none"}`,
        success: true,
      };
    }

    // Fallback: answer from purchased package metadata (demo mode)
    if (this.memory.purchasedPackages.length > 0) {
      const pkgNames = this.memory.purchasedPackages.map((p) => p.name);
      const pkgDescriptions = this.memory.purchasedPackages
        .map((p) => {
          const listing = this.registry.getPackage(p.id);
          return listing
            ? `"${listing.name}": ${listing.description} (tags: ${listing.tags})`
            : `"${p.name}"`;
        })
        .join("\n");

      const answer =
        `Based on purchased knowledge from ${pkgNames.join(", ")}:\n\n` +
        `${pkgDescriptions}\n\n` +
        `This knowledge covers the topic of your question: "${question}". ` +
        `The packages contain detailed information about the subjects described above.`;

      addQuery(this.memory, {
        question,
        answer,
        source: pkgNames.join(", "),
      });

      return { result: answer, success: true };
    }

    return {
      result: "No knowledge loaded. Buy a package first.",
      success: false,
    };
  }

  private async toolCheckBalance(): Promise<{ result: string; success: boolean }> {
    const w = getActiveWallet();
    if (!w) {
      return { result: "No wallet configured.", success: false };
    }

    const balance = await getBalance(w.address);
    return {
      result: `Wallet ${w.address}: ${balance.formatted} MON`,
      success: true,
    };
  }

  private toolWriteNote(note: string): { result: string; success: boolean } {
    addNote(this.memory, note);
    saveMemory(this.memory, this.memoryPath);
    return {
      result: `Note saved: "${note.slice(0, 100)}${note.length > 100 ? "..." : ""}"`,
      success: true,
    };
  }

  private toolRecallMemory(query: string): { result: string; success: boolean } {
    const queryLower = query.toLowerCase();
    const results: string[] = [];

    // Search purchased packages
    const matchedPkgs = this.memory.purchasedPackages.filter(
      (p) => p.name.toLowerCase().includes(queryLower) || p.id.toLowerCase().includes(queryLower),
    );
    if (matchedPkgs.length > 0) {
      results.push("Purchased packages matching query:");
      for (const p of matchedPkgs) {
        results.push(`  - "${p.name}" (${p.price} MON, ${p.timestamp})`);
      }
    }

    // Search query history
    const matchedQueries = this.memory.queryHistory.filter(
      (q) => q.question.toLowerCase().includes(queryLower) || q.answer.toLowerCase().includes(queryLower),
    );
    if (matchedQueries.length > 0) {
      results.push("Past queries matching:");
      for (const q of matchedQueries.slice(-3)) {
        results.push(`  Q: "${q.question}"`);
        results.push(`  A: ${q.answer.slice(0, 150)}...`);
      }
    }

    // Search notes
    const matchedNotes = this.memory.notes.filter(
      (n) => n.toLowerCase().includes(queryLower),
    );
    if (matchedNotes.length > 0) {
      results.push("Notes matching:");
      for (const n of matchedNotes.slice(-3)) {
        results.push(`  ${n}`);
      }
    }

    if (results.length === 0) {
      return { result: `No memory found for "${query}".`, success: true };
    }

    return { result: results.join("\n"), success: true };
  }

  private async toolPostBounty(
    topic: string,
    rewardMon: number,
  ): Promise<{ result: string; success: boolean }> {
    const w = getActiveWallet();
    const bountyId = this.registry.postBounty(
      topic,
      rewardMon,
      w?.address ?? "agent",
    );
    return {
      result: `Bounty posted! ID: ${bountyId}. Topic: "${topic}", Reward: ${rewardMon} MON. Other agents can now fulfill this.`,
      success: true,
    };
  }

  private async toolCheckBounties(): Promise<{ result: string; success: boolean }> {
    const bounties = this.registry.getOpenBounties();
    if (bounties.length === 0) {
      return { result: "No open bounties.", success: true };
    }

    const lines = bounties.map(
      (b) => `- [${b.id}] "${b.topic}" — ${b.rewardMon} MON reward (by ${b.requester.slice(0, 10)}...)`,
    );
    return {
      result: `${bounties.length} open bounty/bounties:\n${lines.join("\n")}`,
      success: true,
    };
  }

  private async toolRatePackage(
    packageId: string,
    stars: number,
    comment: string,
  ): Promise<{ result: string; success: boolean }> {
    const clampedStars = Math.max(1, Math.min(5, Math.round(stars)));
    const w = getActiveWallet();

    this.registry.ratePackage(
      packageId,
      w?.address ?? "agent",
      clampedStars,
      comment,
    );

    return {
      result: `Rated package "${packageId}" with ${clampedStars} star(s).${comment ? ` Comment: "${comment}"` : ""}`,
      success: true,
    };
  }

  private async toolRegisterIdentity(
    name: string,
  ): Promise<{ result: string; success: boolean }> {
    const w = getActiveWallet();
    if (!w) {
      return { result: "No wallet configured. Cannot register on-chain identity.", success: false };
    }

    try {
      const { ERC8004Client, buildAgentURI } = await import("../blockchain/erc8004.js");
      const erc = new ERC8004Client(w.privateKey);

      // Check if already registered
      const isReg = await erc.isRegistered(w.address);
      if (isReg) {
        return {
          result: `Agent already registered on-chain at ${w.address}. ERC-8004 identity exists.`,
          success: true,
        };
      }

      // Build metadata URI and register
      const agentURI = buildAgentURI(
        name,
        "Memory Markets autonomous knowledge agent",
        ["search", "buy", "query", "trade", "rate"],
      );

      const result = await erc.registerAgent(agentURI);

      return {
        result: `Agent "${name}" registered on-chain! AgentId: ${result.agentId}, Tx: ${result.txHash}`,
        success: true,
      };
    } catch (err) {
      return {
        result: `On-chain registration failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  }

  private async toolPostToMoltbook(
    title: string,
    content: string,
  ): Promise<{ result: string; success: boolean }> {
    try {
      const { getConfig } = await import("../config.js");
      const cfg = getConfig();

      if (!cfg.moltbookApiKey) {
        return {
          result: "Moltbook not configured. Set MOLTBOOK_API_KEY to enable posting.",
          success: false,
        };
      }

      const res = await fetch(`${cfg.moltbookApiUrl}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.moltbookApiKey}`,
        },
        body: JSON.stringify({
          submolt: cfg.moltbookDefaultSubmolt,
          title,
          content,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        return {
          result: `Moltbook post failed (${res.status}): ${JSON.stringify(data)}`,
          success: false,
        };
      }

      const postId = (data.id ?? data.post_id ?? "unknown") as string;
      const postUrl = (data.url as string) ?? `https://www.moltbook.com/post/${postId}`;
      addNote(this.memory, `Posted to Moltbook: "${title}" — ${postUrl}`);

      return {
        result: `Posted to Moltbook! Title: "${title}", URL: ${postUrl}`,
        success: true,
      };
    } catch (err) {
      return {
        result: `Moltbook error: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  }

  /** Update on-chain reputation after task completion (best-effort) */
  private async updateOnChainReputation(): Promise<void> {
    const w = getActiveWallet();
    if (!w) return;

    try {
      const { ERC8004Client } = await import("../blockchain/erc8004.js");
      const erc = new ERC8004Client(w.privateKey);
      const isReg = await erc.isRegistered(w.address);
      if (!isReg) return;

      // We need the agentId to give feedback. For simplicity, use agentId = 1
      // In production, this would be stored from the registration step
      const score = this.memory.reputation.tasksCompleted * 2
        + this.memory.reputation.knowledgeBought * 3
        + this.memory.reputation.knowledgeSold * 5;

      // Self-feedback is blocked by ERC-8004, so this is informational only
      // In a real multi-agent scenario, OTHER agents would give feedback
      addNote(this.memory, `On-chain reputation score: ${score} (ERC-8004 ready)`);
    } catch {
      // On-chain update is optional — silently ignore
    }
  }
}
