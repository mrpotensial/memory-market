#!/usr/bin/env node

import { Command } from "commander";
import { resolve } from "path";
import { config as loadEnv } from "dotenv";

// Load .env early so all commands see MONAD_CHAIN_ID, MONAD_RPC_URL, etc.
loadEnv({ path: resolve(import.meta.dirname, "..", "..", ".env") });

const program = new Command();

program
  .name("mm")
  .description("Memory Markets - Where Agents Trade Intelligence")
  .version("0.1.0");

// === Context Engine Commands ===

program
  .command("export")
  .description("Export a directory into a knowledge package (.mmctx)")
  .argument("<dir>", "Directory to export")
  .option("-n, --name <name>", "Package name")
  .option("-t, --tags <tags>", "Comma-separated tags")
  .action(async (dir: string, opts: { name?: string; tags?: string }) => {
    const chalk = (await import("chalk")).default;
    const ora = (await import("ora")).default;

    const sourceDir = resolve(dir);
    const name = opts.name ?? dir.replace(/[\\\/]/g, "-").replace(/^-+|-+$/g, "");
    const tags = opts.tags?.split(",").map((t) => t.trim()) ?? [];

    console.log(
      chalk.bold(`\nMemory Markets - Export Knowledge\n`),
    );
    console.log(`  Source: ${chalk.cyan(sourceDir)}`);
    console.log(`  Name:   ${chalk.cyan(name)}`);
    if (tags.length > 0) {
      console.log(`  Tags:   ${chalk.cyan(tags.join(", "))}`);
    }
    console.log("");

    const spinner = ora("Scanning files...").start();

    try {
      const { exportDirectory } = await import("../context/exporter.js");

      const result = await exportDirectory(sourceDir, {
        name,
        tags,
        onProgress: (stage, done, total) => {
          spinner.text = `${stage}... (${done}/${total})`;
        },
      });

      spinner.succeed("Export complete!");
      console.log("");
      console.log(chalk.green("  Package created successfully:"));
      console.log(`    Output:        ${chalk.cyan(result.outputDir)}`);
      console.log(`    Files scanned: ${result.stats.filesScanned}`);
      console.log(`    Chunks:        ${result.stats.chunksCreated}`);
      console.log(`    Entities:      ${result.stats.entitiesExtracted}`);
      console.log(`    Relationships: ${result.stats.relationshipsFound}`);
      console.log(`    Embeddings:    ${result.stats.embeddingsGenerated}`);
      console.log(`    Package ID:    ${chalk.yellow(result.package.metadata.id)}`);
      console.log("");
    } catch (err) {
      spinner.fail("Export failed!");
      console.error(
        chalk.red(
          `\n  Error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      process.exit(1);
    }
  });

program
  .command("import")
  .description("Import a knowledge package (.mmctx)")
  .argument("<path>", "Path to .mmctx directory")
  .action(async (mmctxPath: string) => {
    const chalk = (await import("chalk")).default;
    const ora = (await import("ora")).default;

    const fullPath = resolve(mmctxPath);
    const spinner = ora(`Importing ${fullPath}...`).start();

    try {
      const { ContextImporter } = await import("../context/importer.js");

      const importer = new ContextImporter();
      importer.load(fullPath);
      const pkg = importer.getPackage();

      spinner.succeed("Import complete!");

      if (pkg) {
        console.log("");
        console.log(`  Name:     ${chalk.cyan(pkg.metadata.name)}`);
        console.log(`  ID:       ${chalk.yellow(pkg.metadata.id)}`);
        console.log(`  Files:    ${pkg.metadata.fileCount}`);
        console.log(`  Entities: ${pkg.metadata.entityCount}`);
        console.log(`  Chunks:   ${pkg.metadata.chunkCount}`);
        console.log("");
        console.log(
          chalk.dim("  Use 'mm query <question>' to ask questions about this package."),
        );
      }
      console.log("");

      // Store the loaded importer path for query command
      const { writeFileSync, mkdirSync } = await import("fs");
      const { homedir } = await import("os");
      const { join } = await import("path");
      const dataDir = join(homedir(), ".memory-markets");
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(
        join(dataDir, "active-package.json"),
        JSON.stringify({ path: fullPath }),
        "utf-8",
      );
    } catch (err) {
      spinner.fail("Import failed!");
      console.error(
        chalk.red(
          `\n  Error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      process.exit(1);
    }
  });

program
  .command("query")
  .description("Ask a question against imported knowledge")
  .argument("<question>", "Question to ask")
  .option("-k, --top-k <k>", "Number of chunks to retrieve", "5")
  .action(async (question: string, opts: { topK: string }) => {
    const chalk = (await import("chalk")).default;
    const ora = (await import("ora")).default;

    // Load active package
    const { readFileSync, existsSync } = await import("fs");
    const { homedir } = await import("os");
    const { join } = await import("path");
    const activePath = join(homedir(), ".memory-markets", "active-package.json");

    if (!existsSync(activePath)) {
      console.error(
        chalk.red("\n  No package loaded. Run 'mm import <path>' first.\n"),
      );
      process.exit(1);
    }

    const { path: mmctxPath } = JSON.parse(readFileSync(activePath, "utf-8"));
    const spinner = ora("Thinking...").start();

    try {
      const { ContextImporter } = await import("../context/importer.js");

      const importer = new ContextImporter();
      importer.load(mmctxPath);

      const result = await importer.query(question, parseInt(opts.topK, 10));
      spinner.stop();

      console.log(chalk.bold(`\n  Q: ${question}\n`));
      console.log(`  ${result.answer}\n`);

      if (result.sources.length > 0) {
        console.log(chalk.dim("  Sources:"));
        for (const src of result.sources) {
          console.log(
            chalk.dim(
              `    - ${src.filePath}:${src.lineStart}-${src.lineEnd} (${(src.score * 100).toFixed(0)}% relevant)`,
            ),
          );
        }
      }
      console.log("");
    } catch (err) {
      spinner.fail("Query failed!");
      console.error(
        chalk.red(
          `\n  Error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      process.exit(1);
    }
  });

// === Marketplace Commands ===

program
  .command("list")
  .description("List all available knowledge packages")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const Table = (await import("cli-table3")).default;
    const { MarketplaceRegistry } = await import("../marketplace/registry.js");

    const registry = new MarketplaceRegistry();
    await registry.init();

    const packages = registry.getAllPackages();

    if (packages.length === 0) {
      console.log(chalk.dim("\n  No packages listed yet. Use 'mm sell' to list one.\n"));
      registry.close();
      return;
    }

    const table = new Table({
      head: [
        chalk.cyan("ID"),
        chalk.cyan("Name"),
        chalk.cyan("Price"),
        chalk.cyan("Token"),
        chalk.cyan("Files"),
        chalk.cyan("Sold"),
      ],
    });

    for (const pkg of packages) {
      table.push([
        pkg.id.slice(0, 14),
        pkg.name.slice(0, 26),
        `${pkg.priceMon} MON`,
        pkg.tokenAddress ? pkg.tokenAddress.slice(0, 12) + "..." : chalk.dim("none"),
        String(pkg.fileCount),
        String(pkg.timesSold),
      ]);
    }

    console.log(chalk.bold(`\nMarketplace - ${packages.length} package(s)\n`));
    console.log(table.toString());
    console.log("");

    registry.close();
  });

program
  .command("search")
  .description("Search for knowledge packages")
  .argument("<query>", "Search query")
  .action(async (query: string) => {
    const chalk = (await import("chalk")).default;
    const Table = (await import("cli-table3")).default;
    const { MarketplaceRegistry } = await import("../marketplace/registry.js");
    const { MarketplaceSearch } = await import("../marketplace/search.js");

    const registry = new MarketplaceRegistry();
    await registry.init();

    const search = new MarketplaceSearch(registry);
    search.loadSummaryIndex();

    const results = await search.search(query);

    if (results.length === 0) {
      console.log(chalk.dim(`\n  No results found for "${query}".\n`));
      registry.close();
      return;
    }

    const table = new Table({
      head: [
        chalk.cyan("Score"),
        chalk.cyan("Name"),
        chalk.cyan("Price"),
        chalk.cyan("Match"),
        chalk.cyan("ID"),
      ],
    });

    for (const r of results) {
      table.push([
        `${(r.score * 100).toFixed(0)}%`,
        r.listing.name.slice(0, 26),
        `${r.listing.priceMon} MON`,
        r.matchType,
        r.listing.id.slice(0, 14),
      ]);
    }

    console.log(chalk.bold(`\nSearch results for "${query}" - ${results.length} match(es)\n`));
    console.log(table.toString());
    console.log("");

    registry.close();
  });

program
  .command("sell")
  .description("Sell a knowledge package (launch token + register)")
  .argument("<mmctx-path>", "Path to .mmctx directory")
  .option("-p, --price <mon>", "Price in MON", "1")
  .option("--no-token", "Skip Nad.fun token launch (register only)")
  .action(async (mmctxPath: string, opts: { price: string; token: boolean }) => {
    const chalk = (await import("chalk")).default;
    const ora = (await import("ora")).default;
    const { readFileSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { MarketplaceRegistry } = await import("../marketplace/registry.js");
    const { MarketplaceSearch } = await import("../marketplace/search.js");

    const fullPath = resolve(mmctxPath);
    const metadataPath = join(fullPath, "metadata.json");

    if (!existsSync(metadataPath)) {
      console.error(chalk.red(`\n  Invalid package: ${metadataPath} not found.\n`));
      process.exit(1);
    }

    const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
    const priceMon = parseFloat(opts.price);

    console.log(chalk.bold("\nSelling Knowledge Package\n"));
    console.log(`  Package: ${chalk.cyan(metadata.name)}`);
    console.log(`  ID:      ${chalk.yellow(metadata.id)}`);
    console.log(`  Price:   ${chalk.green(priceMon + " MON")}`);
    console.log("");

    // Step 1: Launch Nad.fun token (if --token flag is true)
    let tokenAddress: string | null = null;
    let curveAddress: string | null = null;

    if (opts.token) {
      const { getActiveWallet } = await import("../blockchain/wallet.js");
      const { NadFunClient } = await import("../blockchain/nadfun.js");

      const w = getActiveWallet();
      if (!w) {
        console.error(chalk.red("  No wallet found. Run 'mm wallet create' first.\n"));
        process.exit(1);
      }

      const spinner = ora("Launching Nad.fun token...").start();
      try {
        const client = new NadFunClient(w.privateKey);
        const symbol = metadata.name
          .replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase()
          .slice(0, 6) || "KNOW";
        const result = await client.createToken(
          metadata.name,
          symbol,
          "", // tokenURI
          "0", // no initial buy
        );
        tokenAddress = result.tokenAddress;
        curveAddress = result.curveAddress;
        spinner.succeed(`Token launched: ${chalk.green(tokenAddress)}`);
        console.log(`  Tx: ${chalk.dim(result.explorerUrl)}`);
      } catch (err) {
        spinner.fail("Token launch failed. Registering without token.");
        console.error(chalk.dim(`  ${err instanceof Error ? err.message : String(err)}`));
      }
    }

    // Step 2: Register in marketplace
    const spinner2 = ora("Registering in marketplace...").start();
    try {
      const registry = new MarketplaceRegistry();
      await registry.init();

      const { getActiveWallet } = await import("../blockchain/wallet.js");
      const w = getActiveWallet();

      registry.listPackage({
        id: metadata.id,
        name: metadata.name,
        description: metadata.description ?? "",
        tags: (metadata.tags ?? []).join(","),
        priceMon,
        tokenAddress,
        curveAddress,
        creatorAddress: w?.address ?? null,
        packagePath: fullPath,
        fileCount: metadata.fileCount ?? 0,
        chunkCount: metadata.chunkCount ?? 0,
        entityCount: metadata.entityCount ?? 0,
      });

      // Index for semantic search
      const summaryPath = join(fullPath, "summary.md");
      if (existsSync(summaryPath)) {
        try {
          const search = new MarketplaceSearch(registry);
          const summaryText = readFileSync(summaryPath, "utf-8");
          await search.indexPackageSummary(metadata.id, summaryText);
        } catch {
          // Semantic indexing is optional (needs Gemini API key)
        }
      }

      spinner2.succeed("Registered in marketplace!");
      registry.close();
    } catch (err) {
      spinner2.fail("Registration failed!");
      console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }

    console.log(chalk.green("\n  Package is now listed on the marketplace!"));
    console.log(chalk.dim("  Run 'mm list' to see all listed packages.\n"));
  });

program
  .command("buy")
  .description("Buy a knowledge package (buy token + unlock)")
  .argument("<package-id>", "Package ID to buy")
  .action(async (packageId: string) => {
    const chalk = (await import("chalk")).default;
    const ora = (await import("ora")).default;
    const { MarketplaceRegistry } = await import("../marketplace/registry.js");

    const registry = new MarketplaceRegistry();
    await registry.init();

    const pkg = registry.getPackage(packageId);
    if (!pkg) {
      console.error(chalk.red(`\n  Package "${packageId}" not found.\n`));
      registry.close();
      process.exit(1);
    }

    console.log(chalk.bold("\nBuying Knowledge Package\n"));
    console.log(`  Package: ${chalk.cyan(pkg.name)}`);
    console.log(`  Price:   ${chalk.green(pkg.priceMon + " MON")}`);
    console.log("");

    // Buy: try Nad.fun token → direct MON payment → local
    const { getActiveWallet } = await import("../blockchain/wallet.js");
    type Address = `0x${string}`;
    const w = getActiveWallet();

    if (pkg.tokenAddress) {
      // Path 1: Nad.fun token purchase
      if (!w) {
        console.error(chalk.red("  No wallet found. Run 'mm wallet create' first.\n"));
        registry.close();
        process.exit(1);
      }

      const spinner = ora(`Buying token (${pkg.priceMon} MON)...`).start();
      try {
        const { NadFunClient } = await import("../blockchain/nadfun.js");
        const client = new NadFunClient(w.privateKey);
        const result = await client.buyToken(
          pkg.tokenAddress as Address,
          pkg.priceMon.toString(),
        );

        spinner.succeed("Token purchased!");
        console.log(`  Tx: ${chalk.dim(result.explorerUrl)}`);
        registry.recordSale(packageId, w.address, pkg.priceMon, result.txHash);
      } catch (err) {
        spinner.fail("Token purchase failed!");
        console.error(chalk.red(`  ${err instanceof Error ? err.message : String(err)}\n`));
        registry.close();
        process.exit(1);
      }
    } else if (pkg.creatorAddress && pkg.priceMon > 0 && w) {
      // Path 2: Direct MON payment to creator
      const spinner = ora(`Sending ${pkg.priceMon} MON to creator...`).start();
      try {
        const { sendPayment } = await import("../blockchain/payment.js");
        const result = await sendPayment(
          pkg.creatorAddress as Address,
          pkg.priceMon.toString(),
        );

        spinner.succeed("Payment sent!");
        console.log(`  Tx: ${chalk.dim(result.explorerUrl)}`);
        registry.recordSale(packageId, w.address, pkg.priceMon, result.txHash);
      } catch (err) {
        spinner.warn(`Payment failed: ${err instanceof Error ? err.message : String(err)}`);
        console.log(chalk.dim("  Granting local access instead."));
        registry.recordSale(packageId, w.address, 0, "local-fallback");
      }
    } else {
      // Path 3: Local access (no token, no creator, or no wallet)
      console.log(chalk.dim("  Granting local access."));
      registry.recordSale(packageId, w?.address ?? "local", 0, "local");
    }

    // Import the package automatically
    const spinner2 = ora("Importing knowledge...").start();
    try {
      const { existsSync } = await import("fs");
      if (existsSync(pkg.packagePath)) {
        const { writeFileSync, mkdirSync } = await import("fs");
        const { homedir } = await import("os");
        const { join } = await import("path");
        const dataDir = join(homedir(), ".memory-markets");
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(
          join(dataDir, "active-package.json"),
          JSON.stringify({ path: pkg.packagePath }),
          "utf-8",
        );
        spinner2.succeed("Knowledge imported and ready!");
      } else {
        spinner2.warn(`Package path not accessible: ${pkg.packagePath}`);
      }
    } catch (err) {
      spinner2.warn("Auto-import failed, use 'mm import' manually.");
    }

    console.log(chalk.dim("\n  Use 'mm query <question>' to ask questions about this package.\n"));
    registry.close();
  });

program
  .command("preview")
  .description("Preview a package with a free query")
  .argument("<package-id>", "Package ID")
  .argument("<question>", "Question to ask")
  .action(async (packageId: string, question: string) => {
    const chalk = (await import("chalk")).default;
    const ora = (await import("ora")).default;
    const { existsSync, readFileSync } = await import("fs");
    const { join } = await import("path");
    const { MarketplaceRegistry } = await import("../marketplace/registry.js");

    const registry = new MarketplaceRegistry();
    await registry.init();

    const pkg = registry.getPackage(packageId);
    if (!pkg) {
      console.error(chalk.red(`\n  Package "${packageId}" not found.\n`));
      registry.close();
      process.exit(1);
    }

    // Show package summary as preview
    const summaryPath = join(pkg.packagePath, "summary.md");
    if (existsSync(summaryPath)) {
      const summary = readFileSync(summaryPath, "utf-8");
      console.log(chalk.bold(`\nPreview: ${pkg.name}\n`));
      console.log(chalk.dim(summary.slice(0, 1000)));
      if (summary.length > 1000) {
        console.log(chalk.dim("\n  ... (truncated)"));
      }
    }

    // Try to answer with limited context (summary only, no full RAG)
    const spinner = ora("Generating preview answer...").start();
    try {
      const { ContextImporter } = await import("../context/importer.js");
      const importer = new ContextImporter();
      importer.load(pkg.packagePath);
      const result = await importer.query(question, 2); // Limited context
      spinner.stop();

      console.log(chalk.bold(`\n  Q: ${question}\n`));
      console.log(`  ${result.answer}\n`);
      console.log(chalk.yellow("  This is a preview. Buy the full package for complete access."));
      console.log(chalk.dim(`  Run: mm buy ${packageId}\n`));
    } catch (err) {
      spinner.fail("Preview query failed.");
      console.error(chalk.dim(`  ${err instanceof Error ? err.message : String(err)}\n`));
    }

    registry.close();
  });

// === Wallet Commands ===

const wallet = program
  .command("wallet")
  .description("Manage agent wallet");

wallet
  .command("create")
  .description("Create a new agent wallet")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const { createWallet, saveWallet, getBalance } = await import("../blockchain/wallet.js");
    const { getExplorerAddressUrl } = await import("../blockchain/monad.js");

    console.log(chalk.bold("\nCreating new agent wallet...\n"));

    const w = createWallet();
    saveWallet(w);

    console.log(`  Address:     ${chalk.green(w.address)}`);
    console.log(`  Private Key: ${chalk.yellow(w.privateKey)}`);
    console.log(`  Explorer:    ${chalk.dim(getExplorerAddressUrl(w.address))}`);
    console.log("");
    console.log(chalk.dim("  Wallet saved to ~/.memory-markets/wallets/default.json"));
    console.log(chalk.dim("  Add AGENT_PRIVATE_KEY to .env to use it automatically."));
    console.log("");
  });

wallet
  .command("balance")
  .description("Show wallet MON balance")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const { getActiveWallet, getBalance } = await import("../blockchain/wallet.js");
    const { getExplorerAddressUrl } = await import("../blockchain/monad.js");

    const w = getActiveWallet();
    if (!w) {
      console.error(chalk.red("\n  No wallet found. Run 'mm wallet create' first.\n"));
      process.exit(1);
    }

    const balance = await getBalance(w.address);
    console.log("");
    console.log(`  Address: ${chalk.cyan(w.address)}`);
    console.log(`  Balance: ${chalk.green(balance.formatted)} MON`);
    console.log(`  Explorer: ${chalk.dim(getExplorerAddressUrl(w.address))}`);
    console.log("");
  });

wallet
  .command("faucet")
  .description("Request testnet MON from faucet")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const ora = (await import("ora")).default;
    const { getActiveWallet, requestFaucet, getBalance } = await import("../blockchain/wallet.js");

    const w = getActiveWallet();
    if (!w) {
      console.error(chalk.red("\n  No wallet found. Run 'mm wallet create' first.\n"));
      process.exit(1);
    }

    const spinner = ora(`Requesting testnet MON for ${w.address}...`).start();

    const result = await requestFaucet(w.address);

    if (result.success) {
      const balance = await getBalance(w.address);
      spinner.succeed("Faucet request successful!");
      console.log(`  Balance: ${chalk.green(balance.formatted)} MON`);
    } else {
      spinner.warn(result.message);
    }
    console.log("");
  });

// === Token Commands ===

program
  .command("launch-token")
  .description("Launch a Nad.fun token for a knowledge package")
  .option("-n, --name <name>", "Token name", "MemoryKnowledge")
  .option("-s, --symbol <symbol>", "Token symbol", "KNOW")
  .option("-u, --uri <uri>", "Token metadata URI", "")
  .option("-b, --buy <amount>", "Initial buy amount in MON", "0")
  .action(async (opts: { name: string; symbol: string; uri: string; buy: string }) => {
    const chalk = (await import("chalk")).default;
    const ora = (await import("ora")).default;
    const { getActiveWallet } = await import("../blockchain/wallet.js");
    const { NadFunClient } = await import("../blockchain/nadfun.js");

    const w = getActiveWallet();
    if (!w) {
      console.error(chalk.red("\n  No wallet found. Run 'mm wallet create' first.\n"));
      process.exit(1);
    }

    console.log(chalk.bold("\nLaunching Nad.fun Token\n"));
    console.log(`  Name:   ${chalk.cyan(opts.name)}`);
    console.log(`  Symbol: ${chalk.cyan(opts.symbol)}`);
    console.log(`  Cost:   ${chalk.yellow("~10 MON")} (deploy fee)`);
    console.log("");

    const spinner = ora("Creating token on Monad testnet...").start();

    try {
      const client = new NadFunClient(w.privateKey);
      const result = await client.createToken(opts.name, opts.symbol, opts.uri, opts.buy);

      spinner.succeed("Token launched!");
      console.log("");
      console.log(`  Token:    ${chalk.green(result.tokenAddress)}`);
      console.log(`  Curve:    ${chalk.cyan(result.curveAddress)}`);
      console.log(`  Tx:       ${chalk.dim(result.explorerUrl)}`);
      console.log("");
    } catch (err) {
      spinner.fail("Token launch failed!");
      console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  });

program
  .command("buy-token")
  .description("Buy a Nad.fun token with MON")
  .argument("<token-address>", "Token contract address")
  .option("-a, --amount <mon>", "Amount of MON to spend", "0.1")
  .action(async (tokenAddress: string, opts: { amount: string }) => {
    const chalk = (await import("chalk")).default;
    const ora = (await import("ora")).default;
    const { getActiveWallet } = await import("../blockchain/wallet.js");
    const { NadFunClient } = await import("../blockchain/nadfun.js");
    type Address = `0x${string}`;

    const w = getActiveWallet();
    if (!w) {
      console.error(chalk.red("\n  No wallet found. Run 'mm wallet create' first.\n"));
      process.exit(1);
    }

    const spinner = ora(`Buying token with ${opts.amount} MON...`).start();

    try {
      const client = new NadFunClient(w.privateKey);
      const result = await client.buyToken(tokenAddress as Address, opts.amount);

      spinner.succeed("Token purchased!");
      console.log(`  Tx: ${chalk.dim(result.explorerUrl)}`);
      console.log("");
    } catch (err) {
      spinner.fail("Purchase failed!");
      console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  });

// === Agent Commands ===

program
  .command("agent-run")
  .description("Start the autonomous agent with a task")
  .argument("<task>", "Task for the agent to complete")
  .option("-s, --max-steps <n>", "Maximum steps", "10")
  .option("-b, --budget <mon>", "Budget in MON", "5")
  .action(async (task: string, opts: { maxSteps: string; budget: string }) => {
    const chalk = (await import("chalk")).default;
    const { AutonomousAgent } = await import("../agent/autonomous.js");

    console.log(chalk.bold("\nAutonomous Agent\n"));
    console.log(`  Task:   ${chalk.cyan(task)}`);
    console.log(`  Budget: ${chalk.yellow(opts.budget + " MON")}`);
    console.log(`  Steps:  max ${opts.maxSteps}`);
    console.log("");

    const agent = new AutonomousAgent();
    const result = await agent.runTask(task, {
      maxSteps: parseInt(opts.maxSteps, 10),
      budgetMon: parseFloat(opts.budget),
      onStep: (step) => {
        const icon = step.success ? chalk.green("*") : chalk.red("x");
        const toolName = step.tool ? chalk.cyan(step.tool) : chalk.dim("thinking");
        console.log(`  ${icon} Step ${step.step}: ${toolName}`);
        if (step.tool) {
          console.log(chalk.dim(`    ${step.result.slice(0, 150)}${step.result.length > 150 ? "..." : ""}`));
        }
        console.log("");
      },
    });

    console.log(chalk.bold("\n  Result:\n"));
    console.log(`  Completed: ${result.completed ? chalk.green("Yes") : chalk.red("No")}`);
    console.log(`  MON Spent: ${chalk.yellow(result.monSpent.toString())}`);
    console.log(`  Knowledge: ${result.knowledgeAcquired.join(", ") || "none"}`);

    if (result.finalAnswer) {
      console.log(chalk.bold("\n  Answer:\n"));
      console.log(`  ${result.finalAnswer}\n`);
    }
  });

program
  .command("multi-agent")
  .description("Run a multi-agent scenario (Seller + Buyer coordination)")
  .argument("<scenario>", "Scenario description")
  .option("-s, --max-steps <n>", "Max steps per agent", "8")
  .option("-b, --budget <mon>", "Budget per agent in MON", "5")
  .action(async (scenario: string, opts: { maxSteps: string; budget: string }) => {
    const chalk = (await import("chalk")).default;
    const { AgentCoordinator } = await import("../agent/coordinator.js");

    console.log(chalk.bold("\nMulti-Agent Coordination\n"));
    console.log(`  Scenario: ${chalk.cyan(scenario)}`);
    console.log(`  Budget:   ${chalk.yellow(opts.budget + " MON per agent")}`);
    console.log(`  Steps:    max ${opts.maxSteps} per agent`);
    console.log("");

    const coordinator = new AgentCoordinator();
    const result = await coordinator.runScenario(scenario, {
      maxStepsPerAgent: parseInt(opts.maxSteps, 10),
      budgetPerAgent: parseFloat(opts.budget),
      onStep: (step) => {
        const icon = step.step.success ? chalk.green("*") : chalk.red("x");
        const agent = step.agentRole === "seller" ? chalk.magenta(step.agentName) : chalk.blue(step.agentName);
        const toolName = step.step.tool ? chalk.cyan(step.step.tool) : chalk.dim("thinking");
        console.log(`  ${icon} [${agent}] Step ${step.step.step}: ${toolName}`);
        if (step.step.tool) {
          console.log(chalk.dim(`    ${step.step.result.slice(0, 150)}${step.step.result.length > 150 ? "..." : ""}`));
        }
        console.log("");
      },
    });

    console.log(chalk.bold("\n  Multi-Agent Result:\n"));
    console.log(`  Success:    ${result.success ? chalk.green("Yes") : chalk.red("No")}`);
    console.log(`  Total MON:  ${chalk.yellow(result.totalMonSpent.toString())}`);
    console.log("");

    for (const agent of result.agents) {
      console.log(chalk.bold(`  ${agent.name} (${agent.role}):`));
      console.log(`    Completed: ${agent.result.completed ? "Yes" : "No"}`);
      console.log(`    MON Spent: ${agent.result.monSpent}`);
      console.log(`    Knowledge: ${agent.result.knowledgeAcquired.join(", ") || "none"}`);
      if (agent.result.reputation) {
        console.log(`    Reputation: ${agent.result.reputation}`);
      }
      if (agent.result.finalAnswer) {
        console.log(`    Answer: ${agent.result.finalAnswer.slice(0, 200)}${agent.result.finalAnswer.length > 200 ? "..." : ""}`);
      }
      console.log("");
    }
  });

program
  .command("api")
  .description("Start the Memory Markets API server")
  .option("-p, --port <port>", "Port number", "3001")
  .action(async (opts: { port: string }) => {
    const { startServer } = await import("../api/server.js");
    startServer(parseInt(opts.port, 10));
  });

// === ERC-8004 Agent Identity ===

program
  .command("agent-register")
  .description("Register agent identity on-chain (ERC-8004)")
  .option("-n, --name <name>", "Agent display name", "MemoryMarketsAgent")
  .action(async (opts: { name: string }) => {
    const chalk = (await import("chalk")).default;
    const ora = (await import("ora")).default;
    const { getActiveWallet } = await import("../blockchain/wallet.js");
    const { ERC8004Client, buildAgentURI } = await import("../blockchain/erc8004.js");
    const { getExplorerAddressUrl } = await import("../blockchain/monad.js");

    const w = getActiveWallet();
    if (!w) {
      console.error(chalk.red("\n  No wallet found. Run 'mm wallet create' first.\n"));
      process.exit(1);
    }

    console.log(chalk.bold("\nERC-8004 Agent Registration\n"));
    console.log(`  Address: ${chalk.cyan(w.address)}`);
    console.log(`  Name:    ${chalk.cyan(opts.name)}`);
    console.log("");

    const erc = new ERC8004Client(w.privateKey);

    // Check if already registered
    const spinner1 = ora("Checking registration status...").start();
    const isReg = await erc.isRegistered(w.address);

    if (isReg) {
      spinner1.succeed("Agent already registered on-chain!");
      console.log(chalk.dim(`  Explorer: ${getExplorerAddressUrl(w.address)}`));
      console.log("");
      return;
    }
    spinner1.succeed("Not yet registered.");

    // Register
    const spinner2 = ora("Registering agent on-chain...").start();
    try {
      const agentURI = buildAgentURI(
        opts.name,
        "Memory Markets autonomous knowledge agent",
        ["search", "buy", "query", "trade", "rate", "bounty"],
      );

      const result = await erc.registerAgent(agentURI);
      spinner2.succeed("Agent registered on-chain!");
      console.log("");
      console.log(`  Agent ID: ${chalk.green(result.agentId.toString())}`);
      console.log(`  Tx:       ${chalk.dim(result.explorerUrl)}`);
      console.log(`  Explorer: ${chalk.dim(getExplorerAddressUrl(w.address))}`);
      console.log("");
    } catch (err) {
      spinner2.fail("Registration failed!");
      console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  });

program
  .command("agent-identity")
  .description("Show on-chain agent identity and reputation (ERC-8004)")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const ora = (await import("ora")).default;
    const { getActiveWallet } = await import("../blockchain/wallet.js");
    const { ERC8004Client } = await import("../blockchain/erc8004.js");
    const { loadMemory, getReputationSummary } = await import("../agent/memory.js");

    const w = getActiveWallet();
    if (!w) {
      console.error(chalk.red("\n  No wallet found. Run 'mm wallet create' first.\n"));
      process.exit(1);
    }

    console.log(chalk.bold("\nAgent Identity (ERC-8004)\n"));
    console.log(`  Address: ${chalk.cyan(w.address)}`);

    const erc = new ERC8004Client();

    // Check contract deployment status first
    const spinner = ora("Checking ERC-8004 contracts...").start();
    const contracts = await erc.verifyContracts();

    if (!contracts.identity) {
      spinner.warn("ERC-8004 Identity contract not found on Monad testnet.");
      console.log(chalk.dim("  Registration will be available once contracts are deployed."));
    } else {
      spinner.succeed("ERC-8004 contracts found.");
      const isReg = await erc.isRegistered(w.address);
      if (isReg) {
        console.log(`  Status:  ${chalk.green("Registered on-chain")}`);
      } else {
        console.log(`  Status:  ${chalk.yellow("Not registered")}`);
        console.log(chalk.dim("  Run 'mm agent-register' to register."));
      }
    }

    // Show local reputation
    const memory = loadMemory();
    console.log("");
    console.log(chalk.bold("  Local Reputation:"));
    console.log(`  ${getReputationSummary(memory)}`);
    console.log(`  Tasks:     ${memory.reputation.tasksCompleted}`);
    console.log(`  Purchases: ${memory.reputation.knowledgeBought}`);
    console.log(`  MON Spent: ${memory.reputation.totalMonSpent.toFixed(2)}`);
    console.log("");
  });

// === MCP Server ===

program
  .command("mcp")
  .description("Start MCP server (for Claude Desktop, Cursor, etc.)")
  .action(async () => {
    const { startMcpServer } = await import("../mcp/server.js");
    await startMcpServer();
  });

program.parse();
