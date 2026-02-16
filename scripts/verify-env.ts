/**
 * Verify Environment - Tests all subsystems are working.
 * Run: npx tsx scripts/verify-env.ts
 */

import chalk from "chalk";

const results: { name: string; ok: boolean; detail: string }[] = [];

function log(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  const icon = ok ? chalk.green("✓") : chalk.red("✗");
  console.log(`  ${icon} ${name}: ${detail}`);
}

async function verifyNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0], 10);
  log("Node.js", major >= 20, `${version} (need >=20)`);
}

async function verifyAIProvider() {
  const provider = process.env.AI_PROVIDER ?? "gemini";

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      log("OpenRouter API", false, "OPENROUTER_API_KEY not set in .env");
      return;
    }

    try {
      const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Say 'hello' in one word." }],
          max_tokens: 10,
        }),
      });

      if (!resp.ok) {
        log("OpenRouter API", false, `HTTP ${resp.status}: ${resp.statusText}`);
        return;
      }

      const data = await resp.json() as { choices: { message: { content: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? "";
      log("OpenRouter API", true, `Model: ${model}, Response: "${text.trim().slice(0, 50)}"`);
    } catch (err) {
      log("OpenRouter API", false, err instanceof Error ? err.message : String(err));
    }
  } else {
    // Gemini
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        log("Gemini API", false, "GEMINI_API_KEY not set in .env");
        return;
      }

      const genAI = new GoogleGenerativeAI(apiKey);

      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent("Say 'hello' in one word.");
      const text = result.response.text();
      log("Gemini API", true, `Response: "${text.trim().slice(0, 50)}"`);
    } catch (err) {
      log("Gemini API", false, err instanceof Error ? err.message : String(err));
    }
  }
}

async function verifyMonad() {
  try {
    const { createPublicClient, http } = await import("viem");

    const client = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
    });

    const blockNumber = await client.getBlockNumber();
    log("Monad Testnet", true, `Block #${blockNumber}`);
  } catch (err) {
    log(
      "Monad Testnet",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function verifySQLite() {
  try {
    const initSqlJs = (await import("sql.js")).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run("CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)");
    db.run("INSERT INTO test (val) VALUES ('hello')");
    const result = db.exec("SELECT val FROM test");
    const val = result[0].values[0][0] as string;
    db.close();
    log("SQLite (sql.js)", true, `Query result: "${val}"`);
  } catch (err) {
    log("SQLite (sql.js)", false, err instanceof Error ? err.message : String(err));
  }
}

async function verifyImports() {
  try {
    await import("commander");
    await import("zod");
    await import("dotenv");
    log("Core imports", true, "commander, zod, dotenv OK");
  } catch (err) {
    log(
      "Core imports",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function main() {
  console.log(chalk.bold("\n🔍 Memory Markets - Environment Verification\n"));

  // Load .env
  const { config } = await import("dotenv");
  const { resolve } = await import("path");
  config({ path: resolve(import.meta.dirname, "..", ".env") });

  await verifyNodeVersion();
  await verifyImports();
  await verifyAIProvider();
  await verifyMonad();
  await verifySQLite();

  console.log("");

  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    console.log(chalk.green.bold("All checks passed! Environment is ready."));
  } else {
    console.log(
      chalk.yellow.bold(
        `${failed.length} check(s) failed. Fix these before proceeding:`,
      ),
    );
    for (const f of failed) {
      console.log(chalk.red(`  - ${f.name}: ${f.detail}`));
    }
  }
  console.log("");
}

main().catch(console.error);
