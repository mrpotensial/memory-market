/**
 * Memory Markets - Autonomous Agent Demo
 *
 * Demonstrates the full lifecycle:
 * 1. Agent-A: Exports codebase knowledge, launches token, lists on marketplace
 * 2. Agent-B: Gets a task, searches marketplace, buys knowledge, answers questions
 *
 * Run: npx tsx examples/demo-agent.ts
 *
 * Prerequisites:
 * - AI_PROVIDER + API key in .env (Gemini or OpenRouter)
 * - Wallet with testnet MON (run: npm run mm -- wallet create && npm run mm -- wallet faucet)
 * - Exported .mmctx package (run: npm run mm -- export ./src --name mm-source)
 */

import chalk from "chalk";
import ora from "ora";
import { resolve, join } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";
import { MarketplaceRegistry } from "../src/marketplace/registry.js";
import { MarketplaceSearch } from "../src/marketplace/search.js";
import { AutonomousAgent, type AgentStep } from "../src/agent/autonomous.js";
import { loadMemory, getReputationSummary } from "../src/agent/memory.js";
import { getActiveWallet } from "../src/blockchain/wallet.js";
import { NadFunClient } from "../src/blockchain/nadfun.js";

async function main() {
  console.log(chalk.bold.cyan("\n╔════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║     Memory Markets - Autonomous Agent Demo     ║"));
  console.log(chalk.bold.cyan("╚════════════════════════════════════════════════╝\n"));

  // === Phase 1: Agent-A creates and sells knowledge ===

  console.log(chalk.bold.yellow("Phase 1: Agent-A - Knowledge Creator\n"));

  // Check for an existing .mmctx package — try mm-source first, then any .mmctx
  let mmctxPath = resolve("mm-source.mmctx");
  if (!existsSync(mmctxPath)) {
    // Find any .mmctx directory
    const found = readdirSync(".").find((f) => f.endsWith(".mmctx") && existsSync(join(f, "metadata.json")));
    if (found) {
      mmctxPath = resolve(found);
    } else {
      console.log(chalk.red("  No .mmctx package found. Run this first:"));
      console.log(chalk.dim("  npm run mm -- export ./src --name mm-source\n"));
      process.exit(1);
    }
  }

  const metadataPath = join(mmctxPath, "metadata.json");
  const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));

  console.log(`  Package: ${chalk.cyan(metadata.name)}`);
  console.log(`  ID:      ${chalk.yellow(metadata.id)}`);
  console.log(`  Files:   ${metadata.fileCount}`);
  console.log(`  Chunks:  ${metadata.chunkCount}\n`);

  // Register on marketplace
  const spinner1 = ora("Agent-A: Registering knowledge on marketplace...").start();
  const registry = new MarketplaceRegistry();
  await registry.init();

  const w = getActiveWallet();
  const priceMon = 0.5;

  // Launch token if wallet is available
  let tokenAddress: string | null = null;
  let curveAddress: string | null = null;

  if (w) {
    spinner1.text = "Agent-A: Launching Nad.fun token...";
    try {
      const client = new NadFunClient(w.privateKey);
      const symbol = metadata.name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 5) || "KNOW";
      const result = await client.createToken(metadata.name, symbol, "", "0");
      tokenAddress = result.tokenAddress;
      curveAddress = result.curveAddress;
      spinner1.text = `Agent-A: Token launched at ${tokenAddress.slice(0, 10)}...`;
    } catch (err) {
      // Token launch is optional for demo
      spinner1.text = "Agent-A: Token launch skipped (continuing without on-chain token)";
    }
  }

  registry.listPackage({
    id: metadata.id,
    name: metadata.name,
    description: metadata.description ?? "Knowledge package",
    tags: (metadata.tags ?? []).join(","),
    priceMon,
    tokenAddress,
    curveAddress,
    creatorAddress: w?.address ?? null,
    packagePath: mmctxPath,
    fileCount: metadata.fileCount ?? 0,
    chunkCount: metadata.chunkCount ?? 0,
    entityCount: metadata.entityCount ?? 0,
  });

  // Index for semantic search
  const summaryPath = join(mmctxPath, "summary.md");
  if (existsSync(summaryPath)) {
    try {
      const search = new MarketplaceSearch(registry);
      const summaryText = readFileSync(summaryPath, "utf-8");
      await search.indexPackageSummary(metadata.id, summaryText);
    } catch {
      // Semantic indexing optional
    }
  }

  spinner1.succeed("Agent-A: Knowledge listed on marketplace!");
  console.log(`  Token:   ${chalk.green(tokenAddress ?? "none (local)")}`);
  console.log(`  Price:   ${chalk.green(priceMon + " MON")}`);

  registry.close();

  // === Phase 2: Agent-B autonomously finds and uses knowledge ===

  console.log(chalk.bold.yellow("\n\nPhase 2: Agent-B - Knowledge Consumer\n"));
  console.log(chalk.dim("  Agent-B will autonomously:\n  1. Search marketplace\n  2. Buy knowledge\n  3. Answer the question\n"));

  const task = "What is Memory Markets and how does the agent-to-agent knowledge trading work?";
  console.log(`  Task: ${chalk.cyan(task)}\n`);

  const agent = new AutonomousAgent();
  const result = await agent.runTask(task, {
    maxSteps: 12,
    budgetMon: 2,
    onStep: (step: AgentStep) => {
      const icon = step.success ? chalk.green("✓") : chalk.red("✗");
      const toolName = step.tool ? chalk.cyan(step.tool) : chalk.dim("thinking");
      console.log(`  ${icon} Step ${step.step}: ${toolName}`);
      if (step.tool) {
        console.log(chalk.dim(`    Args: ${JSON.stringify(step.args)}`));
        console.log(chalk.dim(`    Result: ${step.result.slice(0, 200)}${step.result.length > 200 ? "..." : ""}`));
      }
      console.log("");
    },
  });

  // === Results ===

  console.log(chalk.bold.yellow("\n═══ Results ═══\n"));
  console.log(`  Completed: ${result.completed ? chalk.green("Yes") : chalk.red("No")}`);
  console.log(`  Steps:     ${result.steps.length}`);
  console.log(`  MON Spent: ${chalk.yellow(result.monSpent.toString())}`);
  console.log(`  Knowledge: ${result.knowledgeAcquired.join(", ") || "none"}`);
  if (result.reputation) {
    console.log(`  Reputation: ${chalk.yellow(result.reputation)}`);
  }

  if (result.finalAnswer) {
    console.log(chalk.bold("\n  Final Answer:\n"));
    const lines = result.finalAnswer.split("\n");
    for (const line of lines) {
      console.log(`  ${line}`);
    }
  }

  // === Agent Memory ===

  console.log(chalk.bold.yellow("\n═══ Agent Memory ═══\n"));
  const memory = loadMemory();
  console.log(`  Agent ID:   ${chalk.cyan(memory.agentId)}`);
  console.log(`  Reputation: ${chalk.yellow(getReputationSummary(memory))}`);
  console.log(`  Purchases:  ${memory.purchasedPackages.length} packages`);
  console.log(`  Queries:    ${memory.queryHistory.length} queries`);
  console.log(`  Notes:      ${memory.notes.length} notes`);

  if (memory.purchasedPackages.length > 0) {
    console.log(chalk.dim("\n  Recent purchases:"));
    for (const p of memory.purchasedPackages.slice(-3)) {
      console.log(chalk.dim(`    - "${p.name}" (${p.price} MON)`));
    }
  }

  console.log(chalk.bold.cyan("\n╔════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║            Demo Complete!                      ║"));
  console.log(chalk.bold.cyan("╚════════════════════════════════════════════════╝\n"));
}

main().catch((err) => {
  console.error(chalk.red(`\nDemo failed: ${err instanceof Error ? err.message : String(err)}\n`));
  process.exit(1);
});
