import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { scanDirectory } from "../../src/context/scanner.js";

/**
 * Edge-case tests for the file scanner.
 * Tests boundary conditions, encoding issues, and special file types.
 */

describe("Scanner - Edge Cases", () => {
  const testDir = join(import.meta.dirname, "__test_scan_edge__");

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("handles empty directory", () => {
    const chunks = scanDirectory(testDir);
    expect(chunks.length).toBe(0);
  });

  it("handles directory with only ignored files", () => {
    writeFileSync(join(testDir, "photo.png"), Buffer.alloc(100));
    writeFileSync(join(testDir, "archive.zip"), Buffer.alloc(100));

    const chunks = scanDirectory(testDir);
    expect(chunks.length).toBe(0);
  });

  it("handles deeply nested files", () => {
    const deep = join(testDir, "a", "b", "c", "d");
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, "deep.ts"), "export const deep = true;");

    const chunks = scanDirectory(testDir);
    expect(chunks.length).toBe(1);
    expect(chunks[0].filePath).toContain("deep.ts");
  });

  it("handles files with special characters in name", () => {
    writeFileSync(join(testDir, "my-component.test.ts"), "test()");
    writeFileSync(join(testDir, "utils_v2.ts"), "export const v2 = 2;");

    const chunks = scanDirectory(testDir);
    expect(chunks.length).toBe(2);
  });

  it("handles empty files", () => {
    writeFileSync(join(testDir, "empty.ts"), "");

    const chunks = scanDirectory(testDir);
    // Empty files should be scanned but will have empty content
    // Implementation may skip or include them
    // Just verify it doesn't throw
    expect(chunks.length).toBeLessThanOrEqual(1);
  });

  it("handles single-line files", () => {
    writeFileSync(join(testDir, "one-line.ts"), "export const x = 1;");

    const chunks = scanDirectory(testDir);
    expect(chunks.length).toBe(1);
    expect(chunks[0].lineStart).toBe(1);
    expect(chunks[0].lineEnd).toBe(1);
    expect(chunks[0].totalChunks).toBe(1);
  });

  it("handles files exactly at chunk boundary (300 lines)", () => {
    const lines = Array.from({ length: 300 }, (_, i) => `const line${i} = ${i};`);
    writeFileSync(join(testDir, "boundary.ts"), lines.join("\n"));

    const chunks = scanDirectory(testDir);
    // 300 lines should be exactly one chunk (threshold is >300 to split)
    expect(chunks.length).toBe(1);
    expect(chunks[0].lineStart).toBe(1);
    expect(chunks[0].lineEnd).toBe(300);
  });

  it("handles files just above chunk boundary (301 lines)", () => {
    const lines = Array.from({ length: 301 }, (_, i) => `const line${i} = ${i};`);
    writeFileSync(join(testDir, "above-boundary.ts"), lines.join("\n"));

    const chunks = scanDirectory(testDir);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("skips node_modules directory", () => {
    const nmDir = join(testDir, "node_modules", "some-package");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "index.js"), "module.exports = {};");
    writeFileSync(join(testDir, "app.ts"), "import pkg from 'some-package';");

    const chunks = scanDirectory(testDir);
    expect(chunks.length).toBe(1);
    expect(chunks[0].filePath).toContain("app.ts");
  });

  it("skips .git directory", () => {
    const gitDir = join(testDir, ".git", "objects");
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(join(gitDir, "somefile"), "git object");
    writeFileSync(join(testDir, "src.ts"), "export const src = 1;");

    const chunks = scanDirectory(testDir);
    expect(chunks.length).toBe(1);
  });

  it("handles multiple file types in same directory", () => {
    writeFileSync(join(testDir, "main.ts"), "console.log('ts');");
    writeFileSync(join(testDir, "utils.js"), "console.log('js');");
    writeFileSync(join(testDir, "config.json"), '{"key": "value"}');
    writeFileSync(join(testDir, "notes.md"), "# Notes");
    writeFileSync(join(testDir, "Contract.sol"), "pragma solidity ^0.8.0;");

    const chunks = scanDirectory(testDir);
    expect(chunks.length).toBe(5);

    const exts = chunks.map((c) => c.filePath.split(".").pop());
    expect(exts).toContain("ts");
    expect(exts).toContain("js");
    expect(exts).toContain("json");
    expect(exts).toContain("md");
    expect(exts).toContain("sol");
  });

  it("uses forward slashes in file paths", () => {
    const subdir = join(testDir, "src", "utils");
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, "helper.ts"), "export function help() {}");

    const chunks = scanDirectory(testDir);
    expect(chunks.length).toBe(1);
    // Should not contain backslashes (Windows-safe)
    expect(chunks[0].filePath).not.toContain("\\");
  });

  it("correctly chunks large files with overlap", () => {
    // 400 lines -> should produce 2 chunks with 50-line overlap
    const lines = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`);
    writeFileSync(join(testDir, "large.ts"), lines.join("\n"));

    const chunks = scanDirectory(testDir);
    expect(chunks.length).toBe(2);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);

    // Verify overlap: chunk1 end should be >= chunk2 start (due to 50-line overlap)
    expect(chunks[0].lineEnd).toBeGreaterThanOrEqual(chunks[1].lineStart - 50);
  });

  it("detects language from file extension", () => {
    writeFileSync(join(testDir, "app.ts"), "const x = 1;");
    writeFileSync(join(testDir, "script.py"), "x = 1");

    const chunks = scanDirectory(testDir);
    const tsChunk = chunks.find((c) => c.filePath.endsWith(".ts"));
    const pyChunk = chunks.find((c) => c.filePath.endsWith(".py"));

    expect(tsChunk?.language).toBe("typescript");
    expect(pyChunk?.language).toBe("python");
  });
});
