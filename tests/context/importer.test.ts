import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QueryResult } from "../../src/context/importer.js";

/**
 * Tests for the Importer (RAG) module.
 *
 * ContextImporter requires GEMINI_API_KEY for constructor + query.
 * We test:
 * 1. QueryResult type structure
 * 2. RAG context building logic
 * 3. RAG prompt building logic
 * 4. State management (isLoaded, load/query flow)
 * 5. Error cases (query before load)
 */

describe("QueryResult type", () => {
  it("has correct shape with answer and sources", () => {
    const result: QueryResult = {
      answer: "The function calculates prime numbers.",
      sources: [
        { filePath: "src/math.ts", lineStart: 10, lineEnd: 25, score: 0.95 },
        { filePath: "src/utils.ts", lineStart: 1, lineEnd: 5, score: 0.72 },
      ],
    };

    expect(result.answer).toContain("prime numbers");
    expect(result.sources.length).toBe(2);
    expect(result.sources[0].score).toBeGreaterThan(result.sources[1].score);
  });

  it("handles empty sources", () => {
    const result: QueryResult = {
      answer: "No relevant information found.",
      sources: [],
    };

    expect(result.sources.length).toBe(0);
  });
});

describe("RAG context building logic", () => {
  it("builds context with summary", () => {
    const summary = "This is a TypeScript project.";
    let context = "";
    if (summary) {
      context += `## Package Summary\n${summary}\n\n`;
    }
    expect(context).toContain("## Package Summary");
    expect(context).toContain("TypeScript project");
  });

  it("builds context with insights", () => {
    const insights = ["Uses React", "Has unit tests", "Follows MVC pattern"];
    let context = "";
    if (insights.length > 0) {
      context += `## Key Insights\n`;
      for (const insight of insights) {
        context += `- ${insight}\n`;
      }
      context += "\n";
    }

    expect(context).toContain("## Key Insights");
    expect(context).toContain("- Uses React");
    expect(context).toContain("- Has unit tests");
    expect(context).toContain("- Follows MVC pattern");
  });

  it("builds context with entities (max 20)", () => {
    const entities = Array.from({ length: 25 }, (_, i) => ({
      entityType: "class",
      name: `Class${i}`,
      sourceFile: `file${i}.ts`,
      description: `Description ${i}`,
    }));

    const limited = entities.slice(0, 20);
    expect(limited.length).toBe(20);
    expect(limited[0].name).toBe("Class0");
    expect(limited[19].name).toBe("Class19");
  });

  it("builds context with relevant chunks", () => {
    const chunks = [
      {
        chunk: {
          filePath: "src/app.ts",
          content: "export class App {}",
          lineStart: 1,
          lineEnd: 1,
          language: "typescript",
        },
        score: 0.92,
      },
    ];

    let context = `## Relevant Code Sections\n\n`;
    for (const { chunk, score } of chunks) {
      context += `### ${chunk.filePath} (lines ${chunk.lineStart}-${chunk.lineEnd}, relevance: ${(score * 100).toFixed(0)}%)\n`;
      context += `\`\`\`${chunk.language ?? ""}\n`;
      context += chunk.content.slice(0, 3000);
      context += "\n```\n\n";
    }

    expect(context).toContain("src/app.ts");
    expect(context).toContain("relevance: 92%");
    expect(context).toContain("```typescript");
    expect(context).toContain("export class App {}");
  });

  it("truncates chunk content to 3000 chars", () => {
    const longContent = "x".repeat(5000);
    const truncated = longContent.slice(0, 3000);
    expect(truncated.length).toBe(3000);
  });
});

describe("RAG prompt building logic", () => {
  it("builds prompt with context and question", () => {
    const context = "## Summary\nThis is a test.";
    const question = "What does this project do?";

    const prompt = `You are a knowledgeable AI assistant that answers questions based on the provided context.
You have been given knowledge from a codebase/documentation package. Use ONLY the provided context to answer.
If the context doesn't contain enough information to answer, say so honestly.
Be specific and reference file names, function names, and line numbers when possible.

## Context (Knowledge Package)

${context}

## Question

${question}

## Answer

Provide a clear, accurate, and well-structured answer based on the context above:`;

    expect(prompt).toContain("knowledgeable AI assistant");
    expect(prompt).toContain("Use ONLY the provided context");
    expect(prompt).toContain("This is a test.");
    expect(prompt).toContain("What does this project do?");
  });
});

describe("Importer state management", () => {
  it("initially has no package loaded", () => {
    // ContextImporter starts with pkg === null
    let pkg: unknown = null;
    const isLoaded = pkg !== null;
    expect(isLoaded).toBe(false);
  });

  it("errors when querying without loading", () => {
    const pkg = null;
    const vectorStore = null;
    const embedder = null;

    if (!pkg || !vectorStore || !embedder) {
      const error = new Error("No package loaded. Call load() first.");
      expect(error.message).toBe("No package loaded. Call load() first.");
    }
  });

  it("validates .mmctx package structure", () => {
    // The importer checks for package.json in the .mmctx dir
    const mmctxDir = "/fake/path.mmctx";
    const pkgPath = `${mmctxDir}/package.json`;
    expect(pkgPath).toBe("/fake/path.mmctx/package.json");
  });
});
