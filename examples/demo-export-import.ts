/**
 * Memory Markets - Export & Import Demo
 *
 * Demonstrates the Context Engine pipeline:
 * 1. Scan a directory for source files
 * 2. Extract entities using Gemini
 * 3. Generate embeddings
 * 4. Export as .mmctx package
 * 5. Import and query with RAG
 *
 * Run: npx tsx examples/demo-export-import.ts
 *
 * Prerequisites:
 * - AI_PROVIDER + API key in .env (Gemini or OpenRouter)
 */

import chalk from "chalk";
import ora from "ora";
import { resolve, join } from "path";
import { existsSync, readdirSync, readFileSync } from "fs";
import { exportDirectory } from "../src/context/exporter.js";
import { ContextImporter } from "../src/context/importer.js";

async function main() {
  console.log(chalk.bold.cyan("\n╔═══════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║   Memory Markets - Export & Import Demo            ║"));
  console.log(chalk.bold.cyan("╚═══════════════════════════════════════════════════╝\n"));

  // === Phase 1: Export ===
  const sourceDir = resolve("DOCS");
  const packageName = "mm-docs";
  const outputDir = `${packageName}.mmctx`;

  if (!existsSync(sourceDir)) {
    console.log(chalk.red(`Source directory not found: ${sourceDir}`));
    console.log(chalk.dim("Run this from the project root directory."));
    process.exit(1);
  }

  console.log(chalk.bold.yellow("Phase 1: Exporting Knowledge\n"));
  console.log(`  Source: ${chalk.cyan(sourceDir)}`);
  console.log(`  Output: ${chalk.cyan(outputDir)}\n`);

  const spinner = ora("Exporting...").start();

  try {
    const result = await exportDirectory(sourceDir, {
      name: packageName,
      description: "Memory Markets documentation and plans",
      tags: ["memory-markets", "hackathon", "monad", "nadfun"],
      onProgress: (stage, done, total) => {
        spinner.text = `${stage}: ${done}/${total}`;
      },
    });

    spinner.succeed("Export complete!");
    console.log(`\n  ${chalk.bold("Stats:")}`);
    console.log(`  - Files scanned:      ${chalk.green(result.stats.filesScanned.toString())}`);
    console.log(`  - Chunks created:     ${chalk.green(result.stats.chunksCreated.toString())}`);
    console.log(`  - Entities extracted: ${chalk.green(result.stats.entitiesExtracted.toString())}`);
    console.log(`  - Relationships:      ${chalk.green(result.stats.relationshipsFound.toString())}`);
    console.log(`  - Embeddings:         ${chalk.green(result.stats.embeddingsGenerated.toString())}`);

    // Show package contents
    console.log(`\n  ${chalk.bold("Package contents:")}`);
    if (existsSync(outputDir)) {
      const files = readdirSync(outputDir);
      for (const file of files) {
        console.log(`  - ${file}`);
      }
    }
  } catch (err) {
    spinner.fail(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // === Phase 2: Import & Query ===
  console.log(chalk.bold.yellow("\n\nPhase 2: Importing & Querying Knowledge\n"));

  if (!existsSync(outputDir)) {
    console.log(chalk.red("  .mmctx package not found. Export failed?"));
    process.exit(1);
  }

  const spinner2 = ora("Loading knowledge package...").start();

  try {
    const importer = new ContextImporter();
    importer.load(resolve(outputDir));
    spinner2.succeed("Knowledge loaded!");

    const pkg = importer.getPackage();
    if (pkg) {
      console.log(`\n  Package: ${chalk.cyan(pkg.metadata.name)}`);
      console.log(`  Entities: ${pkg.entities.length}`);
      console.log(`  Summary: ${pkg.summary.slice(0, 200)}...`);
    }

    // Run sample queries
    const queries = [
      "What is Memory Markets?",
      "How do agents trade knowledge?",
      "What blockchain is used?",
    ];

    console.log(chalk.bold.yellow("\n\nPhase 3: RAG Queries\n"));

    for (const question of queries) {
      console.log(`  ${chalk.bold("Q:")} ${chalk.cyan(question)}`);
      const spinner3 = ora("  Searching...").start();

      const result = await importer.query(question, 3);
      spinner3.stop();

      console.log(`  ${chalk.bold("A:")} ${result.answer.slice(0, 300)}`);
      if (result.sources.length > 0) {
        console.log(chalk.dim(`  Sources: ${result.sources.map(s => `${s.filePath}:${s.lineStart}`).join(", ")}`));
      }
      console.log("");
    }
  } catch (err) {
    spinner2.fail(`Import/query failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log(chalk.bold.cyan("\n╔═══════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║              Demo Complete!                        ║"));
  console.log(chalk.bold.cyan("╚═══════════════════════════════════════════════════╝\n"));
}

main().catch((err) => {
  console.error(chalk.red(`\nDemo failed: ${err instanceof Error ? err.message : String(err)}\n`));
  process.exit(1);
});
