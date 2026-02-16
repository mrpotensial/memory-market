/**
 * Memory Markets - Full Demo Script
 *
 * Runs the complete demo flow for hackathon presentation:
 * 1. Context Engine: Export → Import → Query
 * 2. Marketplace: Sell → List → Search → Buy
 * 3. Autonomous Agent: Task → Search → Buy → Answer
 *
 * Run: npx tsx scripts/demo-full.ts
 *
 * Options:
 *   --skip-export     Skip export if .mmctx already exists
 *   --skip-blockchain  Skip blockchain operations
 *   --source <dir>    Source directory to export (default: ./src)
 *   --name <name>     Package name (default: mm-knowledge)
 */

import chalk from "chalk";
import ora from "ora";
import { resolve, join } from "path";
import { existsSync, readFileSync, rmSync } from "fs";

// Parse CLI args
const args = process.argv.slice(2);
const skipExport = args.includes("--skip-export");
const skipBlockchain = args.includes("--skip-blockchain");
const sourceIdx = args.indexOf("--source");
const sourceDir = sourceIdx >= 0 ? resolve(args[sourceIdx + 1]) : resolve("src");
const nameIdx = args.indexOf("--name");
const packageName = nameIdx >= 0 ? args[nameIdx + 1] : "mm-knowledge";
const mmctxPath = resolve(`${packageName}.mmctx`);

function banner(text: string) {
  const line = "═".repeat(56);
  console.log(chalk.bold.cyan(`\n╔${line}╗`));
  console.log(chalk.bold.cyan(`║  ${text.padEnd(54)}║`));
  console.log(chalk.bold.cyan(`╚${line}╝\n`));
}

function section(num: number, text: string) {
  console.log(chalk.bold.yellow(`\n── Phase ${num}: ${text} ${"─".repeat(40 - text.length)}\n`));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  banner("Memory Markets - Full Demo");

  console.log(chalk.dim("  Where Agents Trade Intelligence"));
  console.log(chalk.dim("  Moltiverse Hackathon - Agent+Token Track\n"));
  console.log(`  AI Provider:  ${chalk.cyan(process.env.AI_PROVIDER ?? "gemini")}`);
  console.log(`  Source Dir:   ${chalk.cyan(sourceDir)}`);
  console.log(`  Package Name: ${chalk.cyan(packageName)}`);
  console.log(`  Skip Export:  ${skipExport ? chalk.yellow("yes") : "no"}`);
  console.log(`  Skip Chain:   ${skipBlockchain ? chalk.yellow("yes") : "no"}`);
  console.log("");

  // ================================================================
  // PHASE 1: CONTEXT ENGINE
  // ================================================================
  section(1, "Context Engine");

  let exportedPackageId = "";

  // Step 1.1: Export
  if (skipExport && existsSync(mmctxPath)) {
    console.log(chalk.dim(`  Using existing package: ${mmctxPath}`));
    const metadata = JSON.parse(readFileSync(join(mmctxPath, "metadata.json"), "utf-8"));
    exportedPackageId = metadata.id;
    console.log(`  Package ID: ${chalk.yellow(exportedPackageId)}`);
    console.log(`  Files:      ${metadata.fileCount}`);
    console.log(`  Chunks:     ${metadata.chunkCount}`);
    console.log(`  Entities:   ${metadata.entityCount}`);
  } else {
    if (!existsSync(sourceDir)) {
      console.log(chalk.red(`  Source directory not found: ${sourceDir}`));
      process.exit(1);
    }

    console.log(`  ${chalk.bold("Step 1.1:")} Exporting knowledge from ${chalk.cyan(sourceDir)}\n`);
    const spinner = ora("  Scanning & analyzing files...").start();

    try {
      const { exportDirectory } = await import("../src/context/exporter.js");

      const result = await exportDirectory(sourceDir, {
        name: packageName,
        description: "AI agent knowledge marketplace with blockchain integration, context engine, RAG queries, and autonomous agent trading",
        tags: ["memory-markets", "typescript", "ai", "blockchain", "agent", "knowledge", "marketplace", "monad"],
        onProgress: (stage, done, total) => {
          spinner.text = `  ${stage}: ${done}/${total}`;
        },
      });

      spinner.succeed("  Export complete!");
      console.log("");
      console.log(`    Files scanned:  ${chalk.green(String(result.stats.filesScanned))}`);
      console.log(`    Chunks created: ${chalk.green(String(result.stats.chunksCreated))}`);
      console.log(`    Entities:       ${chalk.green(String(result.stats.entitiesExtracted))}`);
      console.log(`    Relationships:  ${chalk.green(String(result.stats.relationshipsFound))}`);
      console.log(`    Embeddings:     ${chalk.green(String(result.stats.embeddingsGenerated))}`);
      console.log(`    Output:         ${chalk.cyan(result.outputDir)}`);

      exportedPackageId = result.package.metadata.id;
    } catch (err) {
      spinner.fail(`  Export failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  // Step 1.2: Import
  console.log(`\n  ${chalk.bold("Step 1.2:")} Importing knowledge package\n`);
  const spinner2 = ora("  Loading package...").start();

  let importer: any;
  try {
    const { ContextImporter } = await import("../src/context/importer.js");
    importer = new ContextImporter();
    importer.load(mmctxPath);
    spinner2.succeed("  Knowledge imported!");

    const pkg = importer.getPackage();
    if (pkg) {
      console.log(`    Name:     ${chalk.cyan(pkg.metadata.name)}`);
      console.log(`    Entities: ${pkg.entities.length}`);
    }
  } catch (err) {
    spinner2.fail(`  Import failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Step 1.3: RAG Queries
  console.log(`\n  ${chalk.bold("Step 1.3:")} RAG Queries\n`);

  const queries = [
    "How does the AI provider abstraction work?",
    "Explain the marketplace search functionality",
    "How does the autonomous agent make decisions?",
  ];

  for (const question of queries) {
    console.log(`  ${chalk.bold("Q:")} ${chalk.cyan(question)}`);
    const spinner3 = ora("  Thinking...").start();

    try {
      const result = await importer.query(question, 5);
      spinner3.stop();

      // Truncate long answers
      const answer = result.answer.length > 400
        ? result.answer.slice(0, 400) + "..."
        : result.answer;
      console.log(`  ${chalk.bold("A:")} ${answer}`);

      if (result.sources.length > 0) {
        console.log(chalk.dim(`  Sources: ${result.sources.slice(0, 3).map((s: any) => `${s.filePath}:${s.lineStart}`).join(", ")}`));
      }
    } catch (err) {
      spinner3.fail(`  Query failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log("");
  }

  // ================================================================
  // PHASE 2: MARKETPLACE
  // ================================================================
  section(2, "Marketplace");

  // Step 2.1: Sell
  console.log(`  ${chalk.bold("Step 2.1:")} Listing knowledge on marketplace\n`);
  const spinner4 = ora("  Registering package...").start();

  try {
    const { MarketplaceRegistry } = await import("../src/marketplace/registry.js");
    const { MarketplaceSearch } = await import("../src/marketplace/search.js");

    const registry = new MarketplaceRegistry();
    await registry.init();

    const metadata = JSON.parse(readFileSync(join(mmctxPath, "metadata.json"), "utf-8"));
    const priceMon = 0.5;

    const { getActiveWallet } = await import("../src/blockchain/wallet.js");
    const wallet = getActiveWallet();

    registry.listPackage({
      id: metadata.id,
      name: metadata.name,
      description: metadata.description ?? "Demo knowledge package",
      tags: (metadata.tags ?? []).join(","),
      priceMon,
      tokenAddress: null,
      curveAddress: null,
      creatorAddress: wallet?.address ?? null,
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

    spinner4.succeed(`  Listed on marketplace! Price: ${chalk.green(priceMon + " MON")}`);
    registry.close();
  } catch (err) {
    spinner4.fail(`  Registration failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 2.2: List
  console.log(`\n  ${chalk.bold("Step 2.2:")} Browsing marketplace\n`);

  try {
    const { MarketplaceRegistry } = await import("../src/marketplace/registry.js");
    const Table = (await import("cli-table3")).default;

    const registry = new MarketplaceRegistry();
    await registry.init();
    const packages = registry.getAllPackages();

    const table = new Table({
      head: [
        chalk.cyan("ID"),
        chalk.cyan("Name"),
        chalk.cyan("Price"),
        chalk.cyan("Files"),
        chalk.cyan("Entities"),
        chalk.cyan("Sold"),
      ],
      style: { "padding-left": 2 },
    });

    for (const pkg of packages) {
      table.push([
        pkg.id.slice(0, 14),
        pkg.name.slice(0, 20),
        `${pkg.priceMon} MON`,
        String(pkg.fileCount),
        String(pkg.entityCount),
        String(pkg.timesSold),
      ]);
    }

    console.log(`  ${chalk.bold(`${packages.length} package(s) available:`)}\n`);
    console.log(table.toString());
    registry.close();
  } catch (err) {
    console.log(chalk.dim(`  Could not list packages: ${err instanceof Error ? err.message : String(err)}`));
  }

  // Step 2.3: Search
  console.log(`\n  ${chalk.bold("Step 2.3:")} Searching marketplace\n`);

  const searchQueries = ["knowledge", "marketplace"];
  for (const sq of searchQueries) {
    console.log(`  Search: "${chalk.cyan(sq)}"`);
    try {
      const { MarketplaceRegistry } = await import("../src/marketplace/registry.js");
      const { MarketplaceSearch } = await import("../src/marketplace/search.js");

      const registry = new MarketplaceRegistry();
      await registry.init();
      const search = new MarketplaceSearch(registry);
      search.loadSummaryIndex();
      const results = await search.search(sq);

      if (results.length > 0) {
        for (const r of results) {
          console.log(`    ${chalk.green(`${(r.score * 100).toFixed(0)}%`)} ${r.listing.name} [${r.matchType}]`);
        }
      } else {
        console.log(chalk.dim("    No results"));
      }
      registry.close();
    } catch (err) {
      console.log(chalk.dim(`    Search error: ${err instanceof Error ? err.message : String(err)}`));
    }
    console.log("");
  }

  // Step 2.4: Buy (local/no-token)
  console.log(`  ${chalk.bold("Step 2.4:")} Buying knowledge package\n`);

  try {
    const { MarketplaceRegistry } = await import("../src/marketplace/registry.js");
    const registry = new MarketplaceRegistry();
    await registry.init();

    const pkg = registry.getPackage(exportedPackageId);
    if (pkg) {
      console.log(`  Buying: ${chalk.cyan(pkg.name)} for ${chalk.green(pkg.priceMon + " MON")}`);
      registry.recordSale(exportedPackageId, "demo-agent-b", pkg.priceMon, "local-demo");
      console.log(chalk.green("  Purchase recorded!"));

      // Verify sale
      const updated = registry.getPackage(exportedPackageId);
      console.log(`  Times sold: ${chalk.yellow(String(updated?.timesSold ?? 0))}`);
    }
    registry.close();
  } catch (err) {
    console.log(chalk.dim(`  Buy failed: ${err instanceof Error ? err.message : String(err)}`));
  }

  // ================================================================
  // PHASE 3: BLOCKCHAIN (optional)
  // ================================================================
  if (!skipBlockchain) {
    section(3, "Blockchain");

    try {
      const { getActiveWallet, getBalance } = await import("../src/blockchain/wallet.js");
      const { getExplorerAddressUrl } = await import("../src/blockchain/monad.js");

      const w = getActiveWallet();
      if (w) {
        console.log(`  Wallet:  ${chalk.cyan(w.address)}`);
        console.log(`  Explorer: ${chalk.dim(getExplorerAddressUrl(w.address))}`);

        const spinner5 = ora("  Checking balance...").start();
        try {
          const balance = await getBalance(w.address);
          spinner5.succeed(`  Balance: ${chalk.green(balance.formatted + " MON")}`);
        } catch (err) {
          spinner5.warn(`  Balance check failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        console.log(chalk.dim("  No wallet configured. Skipping blockchain demo."));
        console.log(chalk.dim("  Run: npm run mm -- wallet create"));
      }
    } catch (err) {
      console.log(chalk.dim(`  Blockchain error: ${err instanceof Error ? err.message : String(err)}`));
    }
  } else {
    console.log(chalk.dim("\n  Blockchain demo skipped (--skip-blockchain)"));
  }

  // ================================================================
  // PHASE 4: AUTONOMOUS AGENT
  // ================================================================
  section(4, "Autonomous Agent");

  const agentTask = "What is the architecture of this project and how does the knowledge marketplace work?";
  console.log(`  Task: ${chalk.cyan(agentTask)}\n`);

  try {
    const { AutonomousAgent } = await import("../src/agent/autonomous.js");

    const agent = new AutonomousAgent();
    const result = await agent.runTask(agentTask, {
      maxSteps: 12,
      budgetMon: 2,
      onStep: (step: any) => {
        const icon = step.success ? chalk.green("*") : chalk.red("x");
        const toolName = step.tool ? chalk.cyan(step.tool) : chalk.dim("thinking");
        console.log(`  ${icon} Step ${step.step}: ${toolName}`);
        if (step.tool) {
          const preview = step.result.slice(0, 150);
          console.log(chalk.dim(`    ${preview}${step.result.length > 150 ? "..." : ""}`));
        }
        console.log("");
      },
    });

    console.log(chalk.bold("  ── Agent Result ──\n"));
    console.log(`  Completed: ${result.completed ? chalk.green("Yes") : chalk.red("No")}`);
    console.log(`  Steps:     ${result.steps.length}`);
    console.log(`  MON Spent: ${chalk.yellow(String(result.monSpent))}`);
    console.log(`  Knowledge: ${result.knowledgeAcquired.join(", ") || "none"}`);

    if (result.finalAnswer) {
      console.log(chalk.bold("\n  Answer:\n"));
      const lines = result.finalAnswer.split("\n");
      for (const line of lines.slice(0, 20)) {
        console.log(`  ${line}`);
      }
      if (lines.length > 20) {
        console.log(chalk.dim(`\n  ... (${lines.length - 20} more lines)`));
      }
    }
  } catch (err) {
    console.log(chalk.red(`  Agent failed: ${err instanceof Error ? err.message : String(err)}`));
    console.log(chalk.dim("  This is expected if no packages are indexed in the marketplace."));
  }

  // ================================================================
  // PHASE 5: AGENT MEMORY + BOUNTIES + RATINGS
  // ================================================================
  section(5, "Memory, Bounties & Ratings");

  try {
    const { loadMemory, getReputationSummary } = await import("../src/agent/memory.js");

    // Show memory
    const memory = loadMemory();
    console.log(`  ${chalk.bold("Agent Memory:")}`);
    console.log(`    Agent ID:   ${chalk.cyan(memory.agentId)}`);
    console.log(`    Reputation: ${chalk.yellow(getReputationSummary(memory))}`);
    console.log(`    Purchases:  ${memory.purchasedPackages.length}`);
    console.log(`    Queries:    ${memory.queryHistory.length}`);
    console.log(`    Notes:      ${memory.notes.length}`);
    console.log("");

    // Post a bounty
    console.log(`  ${chalk.bold("Posting a bounty...")}`);
    const { MarketplaceRegistry } = await import("../src/marketplace/registry.js");
    const registry = new MarketplaceRegistry();
    await registry.init();

    const bountyId = registry.postBounty(
      "Need knowledge about smart contract security patterns",
      1.5,
      "demo-agent",
    );
    console.log(`    Bounty ID: ${chalk.yellow(bountyId)}`);
    console.log(`    Topic:     ${chalk.cyan("smart contract security patterns")}`);
    console.log(`    Reward:    ${chalk.green("1.5 MON")}`);

    // Check open bounties
    const bounties = registry.getOpenBounties();
    console.log(`    Open bounties: ${chalk.yellow(String(bounties.length))}`);
    console.log("");

    // Rate a package
    if (exportedPackageId) {
      console.log(`  ${chalk.bold("Rating package...")}`);
      registry.ratePackage(exportedPackageId, "demo-agent", 4, "Good knowledge quality!");
      const rating = registry.getPackageRating(exportedPackageId);
      if (rating) {
        console.log(`    Package:  ${chalk.cyan(exportedPackageId.slice(0, 14))}`);
        console.log(`    Rating:   ${chalk.yellow("★".repeat(Math.round(rating.avg)) + "☆".repeat(5 - Math.round(rating.avg)))} (${rating.avg.toFixed(1)}/5, ${rating.count} ratings)`);
      }
    }

    registry.close();
  } catch (err) {
    console.log(chalk.dim(`  Memory/Bounties demo error: ${err instanceof Error ? err.message : String(err)}`));
  }

  // ================================================================
  // PHASE 6: MULTI-AGENT COORDINATION
  // ================================================================
  section(6, "Multi-Agent Coordination");

  console.log(chalk.dim("  Two agents (Seller + Buyer) coordinating through the marketplace\n"));

  try {
    const { AgentCoordinator } = await import("../src/agent/coordinator.js");

    const coordinator = new AgentCoordinator();
    const multiResult = await coordinator.runScenario(
      "Trade knowledge about the Memory Markets codebase between agents",
      {
        maxStepsPerAgent: 6,
        budgetPerAgent: 2,
        onStep: (step: any) => {
          const icon = step.step.success ? chalk.green("*") : chalk.red("x");
          const agentColor = step.agentRole === "seller" ? chalk.magenta : chalk.blue;
          const toolName = step.step.tool ? chalk.cyan(step.step.tool) : chalk.dim("thinking");
          console.log(`  ${icon} [${agentColor(step.agentName)}] Step ${step.step.step}: ${toolName}`);
          if (step.step.tool) {
            console.log(chalk.dim(`    ${step.step.result.slice(0, 120)}${step.step.result.length > 120 ? "..." : ""}`));
          }
          console.log("");
        },
      },
    );

    console.log(chalk.bold("  ── Multi-Agent Result ──\n"));
    console.log(`  Success:    ${multiResult.success ? chalk.green("Yes") : chalk.red("No")}`);
    console.log(`  Total MON:  ${chalk.yellow(String(multiResult.totalMonSpent))}`);

    for (const agent of multiResult.agents) {
      console.log(`\n  ${chalk.bold(agent.name)} (${agent.role}):`);
      console.log(`    Completed:  ${agent.result.completed ? "Yes" : "No"}`);
      console.log(`    MON Spent:  ${agent.result.monSpent}`);
      console.log(`    Knowledge:  ${agent.result.knowledgeAcquired.join(", ") || "none"}`);
      if (agent.result.reputation) {
        console.log(`    Reputation: ${agent.result.reputation}`);
      }
    }
  } catch (err) {
    console.log(chalk.dim(`  Multi-agent error: ${err instanceof Error ? err.message : String(err)}`));
    console.log(chalk.dim("  This is expected if no AI provider is configured."));
  }

  // ================================================================
  // SUMMARY
  // ================================================================
  banner("Demo Complete!");

  console.log(chalk.bold("  What we demonstrated:\n"));
  console.log("  1. Context Engine       - Export codebase → structured knowledge package");
  console.log("  2. RAG Queries          - Ask questions about code the agent never read");
  console.log("  3. Marketplace          - List, search, buy knowledge packages");
  console.log("  4. Autonomous Agent     - AI agent with persistent memory (13 tools)");
  console.log("  5. Memory & Bounties    - Reputation system, bounties, package ratings");
  console.log("  6. Multi-Agent          - Seller + Buyer coordination");
  if (!skipBlockchain) {
    console.log("  7. Blockchain           - Monad testnet wallet integration");
  }
  console.log("");
  console.log(chalk.dim("  Memory Markets - Where Agents Trade Intelligence"));
  console.log(chalk.dim("  Built for Moltiverse Hackathon | Agent+Token Track\n"));
}

main().catch((err) => {
  console.error(chalk.red(`\nDemo failed: ${err instanceof Error ? err.message : String(err)}\n`));
  process.exit(1);
});
