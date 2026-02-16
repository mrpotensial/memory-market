import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// === Types ===

export interface PurchaseRecord {
  id: string;
  name: string;
  price: number;
  timestamp: string;
  txHash: string;
}

export interface QueryRecord {
  question: string;
  answer: string;
  source: string;
  timestamp: string;
}

export interface BountyRecord {
  id: string;
  topic: string;
  rewardMon: number;
  requester: string;
  fulfiller: string | null;
  status: "open" | "fulfilled" | "expired";
  createdAt: string;
}

export interface AgentReputation {
  tasksCompleted: number;
  knowledgeSold: number;
  knowledgeBought: number;
  totalMonEarned: number;
  totalMonSpent: number;
  avgQueryQuality: number;
  level: "novice" | "trader" | "expert" | "whale";
}

export interface AgentMemory {
  agentId: string;
  purchasedPackages: PurchaseRecord[];
  queryHistory: QueryRecord[];
  reputation: AgentReputation;
  preferences: {
    preferredTopics: string[];
    maxPriceWilling: number;
  };
  notes: string[];
  lastActive: string;
}

// === Constants ===

const DATA_DIR = join(homedir(), ".memory-markets");
const MEMORY_PATH = join(DATA_DIR, "agent-memory.json");

// === Functions ===

/** Create a fresh empty memory */
function createEmptyMemory(): AgentMemory {
  return {
    agentId: `agent-${Date.now().toString(36)}`,
    purchasedPackages: [],
    queryHistory: [],
    reputation: {
      tasksCompleted: 0,
      knowledgeSold: 0,
      knowledgeBought: 0,
      totalMonEarned: 0,
      totalMonSpent: 0,
      avgQueryQuality: 0,
      level: "novice",
    },
    preferences: {
      preferredTopics: [],
      maxPriceWilling: 5,
    },
    notes: [],
    lastActive: new Date().toISOString(),
  };
}

/** Load agent memory from disk, or create empty if not found */
export function loadMemory(memoryPath?: string): AgentMemory {
  const filePath = memoryPath ?? MEMORY_PATH;
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as AgentMemory;
      // Validate basic structure
      if (parsed.agentId && Array.isArray(parsed.purchasedPackages)) {
        return parsed;
      }
    }
  } catch {
    // Corrupted file — start fresh
  }
  return createEmptyMemory();
}

/** Save agent memory to disk */
export function saveMemory(memory: AgentMemory, memoryPath?: string): void {
  const filePath = memoryPath ?? MEMORY_PATH;
  const dir = join(filePath, "..");
  mkdirSync(dir, { recursive: true });
  memory.lastActive = new Date().toISOString();
  writeFileSync(filePath, JSON.stringify(memory, null, 2), "utf-8");
}

/** Record a package purchase */
export function addPurchase(
  memory: AgentMemory,
  purchase: Omit<PurchaseRecord, "timestamp">,
): void {
  memory.purchasedPackages.push({
    ...purchase,
    timestamp: new Date().toISOString(),
  });
  memory.reputation.knowledgeBought += 1;
  memory.reputation.totalMonSpent += purchase.price;
  recalculateLevel(memory);
}

/** Record a query and its answer */
export function addQuery(
  memory: AgentMemory,
  query: Omit<QueryRecord, "timestamp">,
): void {
  memory.queryHistory.push({
    ...query,
    timestamp: new Date().toISOString(),
  });
  // Keep only last 100 queries to avoid bloat
  if (memory.queryHistory.length > 100) {
    memory.queryHistory = memory.queryHistory.slice(-100);
  }
}

/** Record a completed task */
export function recordTaskCompletion(memory: AgentMemory): void {
  memory.reputation.tasksCompleted += 1;
  recalculateLevel(memory);
}

/** Add a note that the agent writes to itself */
export function addNote(memory: AgentMemory, note: string): void {
  memory.notes.push(`[${new Date().toISOString()}] ${note}`);
  // Keep only last 50 notes
  if (memory.notes.length > 50) {
    memory.notes = memory.notes.slice(-50);
  }
}

/** Search memory for relevant context given a task description */
export function getRelevantMemory(memory: AgentMemory, task: string): string {
  const lines: string[] = [];
  const taskLower = task.toLowerCase();

  // Identity & reputation
  lines.push(`Agent ID: ${memory.agentId}`);
  lines.push(`Reputation: Level ${memory.reputation.level.toUpperCase()} (${memory.reputation.tasksCompleted} tasks, ${memory.reputation.knowledgeBought} purchases, ${memory.reputation.totalMonSpent.toFixed(2)} MON spent)`);

  // Recent purchases
  if (memory.purchasedPackages.length > 0) {
    lines.push("");
    lines.push("Previously purchased packages:");
    const recent = memory.purchasedPackages.slice(-5);
    for (const p of recent) {
      lines.push(`  - "${p.name}" (${p.price} MON, tx: ${p.txHash.slice(0, 14)}...)`);
    }
  }

  // Relevant past queries (keyword match)
  const relevantQueries = memory.queryHistory
    .filter((q) => {
      const qLower = q.question.toLowerCase();
      return taskLower.split(/\s+/).some((word) => word.length > 3 && qLower.includes(word));
    })
    .slice(-3);

  if (relevantQueries.length > 0) {
    lines.push("");
    lines.push("Relevant past queries:");
    for (const q of relevantQueries) {
      lines.push(`  Q: "${q.question}"`);
      lines.push(`  A: ${q.answer.slice(0, 200)}${q.answer.length > 200 ? "..." : ""}`);
    }
  }

  // Recent notes
  if (memory.notes.length > 0) {
    lines.push("");
    lines.push("Agent notes:");
    const recentNotes = memory.notes.slice(-5);
    for (const n of recentNotes) {
      lines.push(`  ${n}`);
    }
  }

  // Preferences
  if (memory.preferences.preferredTopics.length > 0) {
    lines.push("");
    lines.push(`Preferred topics: ${memory.preferences.preferredTopics.join(", ")}`);
  }
  lines.push(`Max price willing to pay: ${memory.preferences.maxPriceWilling} MON`);

  return lines.join("\n");
}

/** Update the agent reputation level based on activity */
function recalculateLevel(memory: AgentMemory): void {
  const rep = memory.reputation;
  const score = rep.tasksCompleted * 2 + rep.knowledgeBought * 3 + rep.knowledgeSold * 5;

  if (score >= 50) {
    rep.level = "whale";
  } else if (score >= 20) {
    rep.level = "expert";
  } else if (score >= 5) {
    rep.level = "trader";
  } else {
    rep.level = "novice";
  }
}

/** Get a one-line reputation summary */
export function getReputationSummary(memory: AgentMemory): string {
  const rep = memory.reputation;
  const badge = { novice: "🌱", trader: "📊", expert: "🧠", whale: "🐋" }[rep.level];
  return `${badge} ${rep.level.toUpperCase()} | ${rep.tasksCompleted} tasks | ${rep.knowledgeBought} buys | ${rep.totalMonSpent.toFixed(2)} MON spent`;
}
