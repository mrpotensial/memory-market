/**
 * Test OpenRouter connection.
 * Run: npx tsx scripts/test-openrouter.ts
 */

import chalk from "chalk";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(import.meta.dirname, "..", ".env") });

async function main() {
  console.log(chalk.bold("\nMemory Markets - OpenRouter Connection Test\n"));

  const provider = process.env.AI_PROVIDER;
  const key = process.env.OPENROUTER_API_KEY;
  console.log(`  AI_PROVIDER: ${provider}`);
  console.log(`  OPENROUTER_API_KEY: ${key ? key.slice(0, 12) + "..." : "(not set)"}`);
  console.log(`  OPENROUTER_MODEL: ${process.env.OPENROUTER_MODEL || "(default)"}`);
  console.log("");

  if (provider !== "openrouter" || !key) {
    console.log(chalk.yellow("Set AI_PROVIDER=openrouter and OPENROUTER_API_KEY in .env first."));
    return;
  }

  // Test 1: Text generation
  try {
    console.log(chalk.blue("1. Testing text generation..."));
    const { getAIProvider } = await import("../src/ai/index.js");
    const ai = getAIProvider();

    const text = await ai.generateText("Say 'hello' in one word.", {
      temperature: 0.1,
      maxTokens: 50,
    });
    console.log(chalk.green(`   ✓ Response: "${text.trim().slice(0, 80)}"`));
  } catch (err) {
    console.log(chalk.red(`   ✗ ${err instanceof Error ? err.message : err}`));
  }

  // Test 2: Embedding
  try {
    console.log(chalk.blue("2. Testing embedding..."));
    const { getAIProvider } = await import("../src/ai/index.js");
    const ai = getAIProvider();

    const embedding = await ai.embedOne("test embedding");
    console.log(chalk.green(`   ✓ Embedding: ${embedding.length} dimensions`));
  } catch (err) {
    console.log(chalk.red(`   ✗ ${err instanceof Error ? err.message : err}`));
  }

  // Test 3: Tool calling
  try {
    console.log(chalk.blue("3. Testing tool calling..."));
    const { getAIProvider } = await import("../src/ai/index.js");
    const ai = getAIProvider();

    const result = await ai.generateWithTools(
      "Search for 'blockchain' knowledge.",
      [
        {
          name: "search",
          description: "Search for knowledge packages",
          parameters: {
            query: { type: "string" as const, description: "The search query" },
          },
          required: ["query"],
        },
      ],
      { temperature: 0.1 },
    );
    if (result.type === "function_call") {
      console.log(chalk.green(`   ✓ Tool call: ${result.functionName}(${JSON.stringify(result.functionArgs)})`));
    } else {
      console.log(chalk.yellow(`   ~ Text response (no tool call): "${result.text?.slice(0, 80)}"`));
    }
  } catch (err) {
    console.log(chalk.red(`   ✗ ${err instanceof Error ? err.message : err}`));
  }

  console.log(chalk.bold("\nDone.\n"));
}

main().catch(console.error);
