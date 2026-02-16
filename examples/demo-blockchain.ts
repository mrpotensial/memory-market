/**
 * Memory Markets - Blockchain Demo
 *
 * Demonstrates Monad testnet integration:
 * 1. Create a new wallet
 * 2. Check balance
 * 3. Request testnet MON from faucet
 * 4. Launch a Nad.fun token
 * 5. Buy tokens
 *
 * Run: npx tsx examples/demo-blockchain.ts
 *
 * Prerequisites:
 * - AI_PROVIDER + API key in .env (optional, Gemini or OpenRouter)
 * - Wallet with testnet MON for token operations
 */

import chalk from "chalk";
import ora from "ora";
import {
  createWallet,
  loadWallet,
  getActiveWallet,
  getBalance,
  requestFaucet,
  saveWallet,
} from "../src/blockchain/wallet.js";
import { NadFunClient } from "../src/blockchain/nadfun.js";
import type { Address } from "viem";

async function main() {
  console.log(chalk.bold.cyan("\n╔═══════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║    Memory Markets - Blockchain Demo               ║"));
  console.log(chalk.bold.cyan("╚═══════════════════════════════════════════════════╝\n"));

  // === Step 1: Wallet ===
  console.log(chalk.bold.yellow("Step 1: Wallet Management\n"));

  let wallet = getActiveWallet();
  if (!wallet) {
    console.log("  No existing wallet found. Creating a new one...");
    wallet = createWallet();
    saveWallet(wallet);
    console.log(chalk.green("  New wallet created and saved!"));
  } else {
    console.log("  Loaded existing wallet.");
  }

  console.log(`  Address:     ${chalk.cyan(wallet.address)}`);
  console.log(`  Private Key: ${chalk.dim(wallet.privateKey.slice(0, 10) + "..." + wallet.privateKey.slice(-4))}\n`);

  // === Step 2: Balance ===
  console.log(chalk.bold.yellow("Step 2: Check Balance\n"));

  const spinner1 = ora("  Checking balance...").start();
  try {
    const balance = await getBalance(wallet.address);
    spinner1.succeed(`  Balance: ${chalk.green(balance.formatted + " MON")}`);

    if (balance.wei === 0n) {
      console.log(chalk.dim("\n  Wallet is empty. Requesting from faucet..."));

      // === Step 3: Faucet ===
      console.log(chalk.bold.yellow("\nStep 3: Request Faucet\n"));
      const spinner2 = ora("  Requesting testnet MON...").start();

      const faucetResult = await requestFaucet(wallet.address);
      if (faucetResult.success) {
        spinner2.succeed(`  Faucet: ${chalk.green(faucetResult.message)}`);

        // Wait a few seconds for tx to confirm
        console.log(chalk.dim("  Waiting for confirmation..."));
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const newBalance = await getBalance(wallet.address);
        console.log(`  New balance: ${chalk.green(newBalance.formatted + " MON")}`);
      } else {
        spinner2.warn(`  Faucet failed: ${faucetResult.message}`);
        console.log(chalk.dim("  Try manually: https://faucet.monad.xyz/"));
      }
    }
  } catch (err) {
    spinner1.fail(`  Balance check failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // === Step 4: Token Launch (requires MON) ===
  console.log(chalk.bold.yellow("\nStep 4: Launch Nad.fun Token\n"));

  try {
    const balance = await getBalance(wallet.address);
    if (balance.wei < 10_000_000_000_000_000_000n) {
      // Less than 10 MON
      console.log(chalk.dim("  Insufficient balance for token launch (need ~10 MON for create fee)."));
      console.log(chalk.dim("  Skipping token launch. Use faucet to get more MON.\n"));
    } else {
      const spinner3 = ora("  Launching knowledge token on Nad.fun...").start();
      const client = new NadFunClient(wallet.privateKey);

      const result = await client.createToken(
        "Memory Knowledge",
        "MKNOW",
        "",  // tokenURI
        "0", // initial buy amount
      );

      spinner3.succeed("  Token launched!");
      console.log(`  Token Address: ${chalk.cyan(result.tokenAddress)}`);
      console.log(`  Curve Address: ${chalk.cyan(result.curveAddress)}`);
      console.log(`  Tx Hash:       ${chalk.dim(result.txHash)}`);
      console.log(`  Explorer:      ${chalk.blue(`https://testnet.monadexplorer.com/tx/${result.txHash}`)}\n`);

      // === Step 5: Buy Token ===
      console.log(chalk.bold.yellow("Step 5: Buy Token\n"));

      const spinner4 = ora("  Buying tokens...").start();
      try {
        const buyResult = await client.buyToken(
          result.tokenAddress as Address,
          "0.1", // 0.1 MON
        );
        spinner4.succeed("  Tokens purchased!");
        console.log(`  Tx Hash: ${chalk.dim(buyResult.txHash)}`);
      } catch (err) {
        spinner4.warn(`  Buy failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    console.log(chalk.dim(`  Token operations skipped: ${err instanceof Error ? err.message : String(err)}`));
  }

  // === Summary ===
  console.log(chalk.bold.yellow("\nSummary\n"));
  console.log(`  Wallet: ${chalk.cyan(wallet.address)}`);

  try {
    const finalBalance = await getBalance(wallet.address);
    console.log(`  Balance: ${chalk.green(finalBalance.formatted + " MON")}`);
  } catch {
    console.log(`  Balance: ${chalk.dim("(unable to fetch)")}`);
  }

  console.log(chalk.bold.cyan("\n╔═══════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║              Demo Complete!                        ║"));
  console.log(chalk.bold.cyan("╚═══════════════════════════════════════════════════╝\n"));
}

main().catch((err) => {
  console.error(chalk.red(`\nDemo failed: ${err instanceof Error ? err.message : String(err)}\n`));
  process.exit(1);
});
