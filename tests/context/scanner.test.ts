import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { scanDirectory } from "../../src/context/scanner.js";

const TEST_DIR = join(import.meta.dirname, "__test_scan_dir__");

beforeAll(() => {
  // Create test directory structure
  mkdirSync(join(TEST_DIR, "src"), { recursive: true });
  mkdirSync(join(TEST_DIR, "node_modules", "some-pkg"), { recursive: true });
  mkdirSync(join(TEST_DIR, ".git"), { recursive: true });

  // Source files that should be scanned
  writeFileSync(
    join(TEST_DIR, "src", "main.ts"),
    'export function hello() {\n  return "world";\n}\n',
  );
  writeFileSync(
    join(TEST_DIR, "src", "utils.py"),
    'def add(a, b):\n    return a + b\n',
  );
  writeFileSync(
    join(TEST_DIR, "README.md"),
    "# Test Project\n\nThis is a test.\n",
  );

  // Files that should be skipped
  writeFileSync(
    join(TEST_DIR, "node_modules", "some-pkg", "index.js"),
    "module.exports = {};",
  );
  writeFileSync(join(TEST_DIR, ".git", "config"), "[core]\n");
  writeFileSync(join(TEST_DIR, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("scanDirectory", () => {
  it("finds source files and creates chunks", () => {
    const chunks = scanDirectory(TEST_DIR);
    expect(chunks.length).toBeGreaterThan(0);

    const filePaths = chunks.map((c) => c.filePath);
    expect(filePaths).toContain("src/main.ts");
    expect(filePaths).toContain("src/utils.py");
    expect(filePaths).toContain("README.md");
  });

  it("skips node_modules and .git", () => {
    const chunks = scanDirectory(TEST_DIR);
    const filePaths = chunks.map((c) => c.filePath);

    for (const fp of filePaths) {
      expect(fp).not.toContain("node_modules");
      expect(fp).not.toContain(".git");
    }
  });

  it("skips binary files", () => {
    const chunks = scanDirectory(TEST_DIR);
    const filePaths = chunks.map((c) => c.filePath);
    expect(filePaths).not.toContain("image.png");
  });

  it("uses forward slashes in file paths (even on Windows)", () => {
    const chunks = scanDirectory(TEST_DIR);
    for (const chunk of chunks) {
      expect(chunk.filePath).not.toContain("\\");
    }
  });

  it("correctly sets chunk metadata", () => {
    const chunks = scanDirectory(TEST_DIR);
    const mainTs = chunks.find((c) => c.filePath === "src/main.ts");

    expect(mainTs).toBeDefined();
    expect(mainTs!.chunkIndex).toBe(0);
    expect(mainTs!.totalChunks).toBe(1);
    expect(mainTs!.lineStart).toBe(1);
    expect(mainTs!.content).toContain("hello");
    expect(mainTs!.language).toBe("typescript");
  });

  it("chunks large files with overlap", () => {
    // Create a large file
    const largeContent = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join("\n");
    writeFileSync(join(TEST_DIR, "large.ts"), largeContent);

    const chunks = scanDirectory(TEST_DIR, { chunkSize: 100, chunkOverlap: 20 });
    const largeChunks = chunks.filter((c) => c.filePath === "large.ts");

    expect(largeChunks.length).toBeGreaterThan(1);
    expect(largeChunks[0].chunkIndex).toBe(0);
    expect(largeChunks[0].lineStart).toBe(1);

    // Check overlap: end of chunk 0 should overlap with start of chunk 1
    if (largeChunks.length >= 2) {
      expect(largeChunks[1].lineStart).toBeLessThan(largeChunks[0].lineEnd);
    }

    // Clean up
    rmSync(join(TEST_DIR, "large.ts"));
  });

  it("returns empty array for empty directory", () => {
    const emptyDir = join(TEST_DIR, "empty");
    mkdirSync(emptyDir, { recursive: true });
    const chunks = scanDirectory(emptyDir);
    expect(chunks).toEqual([]);
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it("detects language from file extension", () => {
    const chunks = scanDirectory(TEST_DIR);
    const pyChunk = chunks.find((c) => c.filePath === "src/utils.py");
    const mdChunk = chunks.find((c) => c.filePath === "README.md");

    expect(pyChunk?.language).toBe("python");
    expect(mdChunk?.language).toBe("markdown");
  });
});
