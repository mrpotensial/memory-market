import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { getAIProvider } from "../ai/index.js";
import type { AIProvider } from "../ai/types.js";
import type { ContextPackage, FileChunk } from "./models.js";
import { ContextPackageSchema } from "./models.js";
import { LocalVectorStore } from "./vector-store.js";

// === Types ===

export interface QueryResult {
  answer: string;
  sources: { filePath: string; lineStart: number; lineEnd: number; score: number }[];
}

// === Importer ===

/**
 * Import a .mmctx knowledge package and provide RAG-based querying.
 * Loads the package metadata, entities, and vector store for semantic search.
 */
export class ContextImporter {
  private pkg: ContextPackage | null = null;
  private vectorStore: LocalVectorStore | null = null;
  private chunks: Map<string, FileChunk> = new Map();
  private provider: AIProvider;
  private packageDir: string = "";

  constructor() {
    this.provider = getAIProvider();
  }

  /** Load a .mmctx package from disk */
  load(mmctxDir: string): void {
    this.packageDir = mmctxDir;

    // Load package metadata + entities
    const pkgPath = join(mmctxDir, "package.json");
    if (!existsSync(pkgPath)) {
      throw new Error(`Invalid .mmctx package: ${pkgPath} not found`);
    }
    const raw = readFileSync(pkgPath, "utf-8");
    this.pkg = ContextPackageSchema.parse(JSON.parse(raw));

    // Load vector store
    const vectorsPath = join(mmctxDir, "vectors.json");
    if (existsSync(vectorsPath)) {
      this.vectorStore = LocalVectorStore.load(vectorsPath);
    }

    // Load chunks
    this.chunks.clear();
    const chunksDir = join(mmctxDir, "chunks");
    if (existsSync(chunksDir)) {
      const files = readdirSync(chunksDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const chunk = JSON.parse(
            readFileSync(join(chunksDir, file), "utf-8"),
          ) as FileChunk;
          const id = file.replace(".json", "");
          this.chunks.set(id, chunk);
        }
      }
    }
  }

  /** Get package info */
  getPackage(): ContextPackage | null {
    return this.pkg;
  }

  /** Check if a package is loaded */
  isLoaded(): boolean {
    return this.pkg !== null;
  }

  /**
   * Query the loaded knowledge package using RAG.
   *
   * 1. Embed the question
   * 2. Semantic search for top-K relevant chunks
   * 3. Build context from chunks + structured knowledge
   * 4. Send to AI provider for answer generation
   */
  async query(question: string, topK: number = 5): Promise<QueryResult> {
    if (!this.pkg || !this.vectorStore) {
      throw new Error("No package loaded. Call load() first.");
    }

    // Step 1: Embed the question
    const questionEmbedding = await this.provider.embedOne(question);

    // Step 2: Search for relevant chunks
    const searchResults = this.vectorStore.query(questionEmbedding, topK);

    // Step 3: Retrieve actual chunk content
    const relevantChunks: { chunk: FileChunk; score: number }[] = [];
    for (const result of searchResults) {
      const chunk = this.chunks.get(result.id);
      if (chunk) {
        relevantChunks.push({ chunk, score: result.score });
      }
    }

    // Step 4: Build RAG context
    const context = buildRAGContext(this.pkg, relevantChunks);

    // Step 5: Generate answer
    const prompt = buildRAGPrompt(context, question);
    const answer = await this.provider.generateText(prompt, {
      temperature: 0.3,
      maxTokens: 2048,
    });

    return {
      answer,
      sources: relevantChunks.map((rc) => ({
        filePath: rc.chunk.filePath,
        lineStart: rc.chunk.lineStart,
        lineEnd: rc.chunk.lineEnd,
        score: rc.score,
      })),
    };
  }
}

// === RAG Context Building ===

function buildRAGContext(
  pkg: ContextPackage,
  relevantChunks: { chunk: FileChunk; score: number }[],
): string {
  let context = "";

  // Package summary
  if (pkg.summary) {
    context += `## Package Summary\n${pkg.summary}\n\n`;
  }

  // Key insights
  if (pkg.insights.length > 0) {
    context += `## Key Insights\n`;
    for (const insight of pkg.insights) {
      context += `- ${insight}\n`;
    }
    context += "\n";
  }

  // Relevant entities
  if (pkg.entities.length > 0) {
    context += `## Key Entities\n`;
    for (const entity of pkg.entities.slice(0, 20)) {
      context += `- ${entity.entityType} "${entity.name}" in ${entity.sourceFile}: ${entity.description}\n`;
    }
    context += "\n";
  }

  // Relevant code chunks
  if (relevantChunks.length > 0) {
    context += `## Relevant Code Sections\n\n`;
    for (const { chunk, score } of relevantChunks) {
      context += `### ${chunk.filePath} (lines ${chunk.lineStart}-${chunk.lineEnd}, relevance: ${(score * 100).toFixed(0)}%)\n`;
      context += `\`\`\`${chunk.language ?? ""}\n`;
      // Limit chunk content to avoid token overflow
      context += chunk.content.slice(0, 3000);
      context += "\n```\n\n";
    }
  }

  return context;
}

function buildRAGPrompt(context: string, question: string): string {
  return `You are a knowledgeable AI assistant that answers questions based on the provided context.
You have been given knowledge from a codebase/documentation package. Use ONLY the provided context to answer.
If the context doesn't contain enough information to answer, say so honestly.
Be specific and reference file names, function names, and line numbers when possible.

## Context (Knowledge Package)

${context}

## Question

${question}

## Answer

Provide a clear, accurate, and well-structured answer based on the context above:`;
}
