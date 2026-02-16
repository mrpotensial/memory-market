#!/usr/bin/env node

// This bin entry runs the CLI via tsx for development.
// In production (after tsup build), dist/cli/index.js is used directly.
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = resolve(__dirname, "..", "src", "cli", "index.ts");

try {
  execFileSync("npx", ["tsx", cli, ...process.argv.slice(2)], {
    stdio: "inherit",
    cwd: resolve(__dirname, ".."),
  });
} catch {
  process.exit(1);
}
