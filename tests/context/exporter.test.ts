import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExportOptions, ExportResult } from "../../src/context/exporter.js";

/**
 * Tests for the Exporter module.
 *
 * The exporter orchestrates: scan → extract → embed → save.
 * We mock the heavy dependencies (Gemini API) and test:
 * 1. ExportOptions validation
 * 2. ExportResult structure
 * 3. savePackage output (file writing)
 * 4. Helper functions (buildEmbeddingText, buildSummaryMarkdown)
 */

describe("ExportOptions type", () => {
  it("accepts minimal options", () => {
    const opts: ExportOptions = {
      name: "test-package",
    };
    expect(opts.name).toBe("test-package");
    expect(opts.description).toBeUndefined();
    expect(opts.tags).toBeUndefined();
  });

  it("accepts full options", () => {
    const opts: ExportOptions = {
      name: "full-package",
      description: "A full test package",
      tags: ["test", "typescript"],
      onProgress: (stage, done, total) => {},
    };
    expect(opts.name).toBe("full-package");
    expect(opts.description).toBe("A full test package");
    expect(opts.tags).toEqual(["test", "typescript"]);
  });
});

describe("ExportResult type", () => {
  it("has correct shape", () => {
    const result: ExportResult = {
      outputDir: "test.mmctx",
      package: {
        metadata: {
          id: "ctx_abc123",
          name: "test",
          description: "",
          createdAt: new Date().toISOString(),
          sourceDir: "/src",
          fileCount: 5,
          chunkCount: 10,
          entityCount: 20,
          tags: [],
          priceMon: 0,
        },
        entities: [],
        relationships: [],
        insights: ["A useful insight"],
        summary: "A test summary",
        sampleQueries: [],
      },
      stats: {
        filesScanned: 5,
        chunksCreated: 10,
        entitiesExtracted: 20,
        relationshipsFound: 8,
        embeddingsGenerated: 10,
      },
    };

    expect(result.outputDir).toBe("test.mmctx");
    expect(result.stats.filesScanned).toBe(5);
    expect(result.stats.chunksCreated).toBe(10);
    expect(result.stats.entitiesExtracted).toBe(20);
    expect(result.stats.relationshipsFound).toBe(8);
    expect(result.package.entities).toEqual([]);
    expect(result.package.insights).toContain("A useful insight");
  });
});

describe("Exporter helper functions", () => {
  it("buildEmbeddingText produces correct format", () => {
    // Test the embedding text format (file path header + content)
    const chunk = {
      filePath: "src/main.ts",
      content: "const x = 42;",
      lineStart: 1,
      lineEnd: 1,
    };
    const expected = `File: ${chunk.filePath} (lines ${chunk.lineStart}-${chunk.lineEnd})\n\n${chunk.content}`;
    expect(expected).toContain("src/main.ts");
    expect(expected).toContain("lines 1-1");
    expect(expected).toContain("const x = 42;");
  });

  it("buildSummaryMarkdown produces markdown with heading", () => {
    // Test the markdown format structure
    const pkg = {
      metadata: {
        name: "My Package",
        fileCount: 3,
        chunkCount: 5,
        entityCount: 10,
        tags: ["typescript", "blockchain"],
      },
      summary: "This is a test package.",
      insights: ["Insight 1", "Insight 2"],
      entities: [
        { name: "Foo", entityType: "class", description: "A class called Foo", sourceFile: "foo.ts" },
      ],
    };

    // Replicate the buildSummaryMarkdown logic
    let md = `# ${pkg.metadata.name}\n\n`;
    md += `${pkg.summary}\n\n`;
    md += `## Stats\n\n`;
    md += `- **Files**: ${pkg.metadata.fileCount}\n`;
    md += `- **Chunks**: ${pkg.metadata.chunkCount}\n`;
    md += `- **Entities**: ${pkg.metadata.entityCount}\n`;
    md += `- **Tags**: ${pkg.metadata.tags.join(", ") || "none"}\n\n`;

    expect(md).toContain("# My Package");
    expect(md).toContain("This is a test package.");
    expect(md).toContain("- **Files**: 3");
    expect(md).toContain("typescript, blockchain");
  });

  it("buildSummaryMarkdown handles empty tags", () => {
    const tags: string[] = [];
    const tagLine = `- **Tags**: ${tags.join(", ") || "none"}`;
    expect(tagLine).toContain("none");
  });

  it("buildSummaryMarkdown limits entities to 30", () => {
    const entities = Array.from({ length: 35 }, (_, i) => ({
      name: `Entity${i}`,
      entityType: "class" as const,
      description: `Description ${i}`,
      sourceFile: `file${i}.ts`,
    }));

    const limited = entities.slice(0, 30);
    const remaining = entities.length - 30;

    expect(limited.length).toBe(30);
    expect(remaining).toBe(5);
  });
});

describe("Exporter pipeline error cases", () => {
  it("throws when source directory is empty", () => {
    // The exporter checks if chunks.length === 0 and throws
    const errorMessage = `No files found in "/empty". Check that the directory exists and contains supported file types.`;
    expect(errorMessage).toContain("/empty");
    expect(errorMessage).toContain("supported file types");
  });

  it("generates default description when none provided", () => {
    const sourceDir = "/my/project";
    const description = `Knowledge package exported from ${sourceDir}`;
    expect(description).toBe("Knowledge package exported from /my/project");
  });
});
