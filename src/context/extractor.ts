import { getAIProvider } from "../ai/index.js";
import type { AIProvider } from "../ai/types.js";
import type { Entity, FileChunk, Relationship } from "./models.js";
import { z } from "zod";

// === Extractor ===

/**
 * Extract structured entities and relationships from code using the configured AI provider.
 * Handles rate limiting for the free tier (15 RPM).
 */
export class GeminiExtractor {
  private provider: AIProvider;

  constructor() {
    this.provider = getAIProvider();
  }

  /**
   * Extract entities from a list of file chunks.
   * Processes chunks sequentially with rate limiting.
   */
  async extractEntities(
    chunks: FileChunk[],
    options: { onProgress?: (done: number, total: number) => void } = {},
  ): Promise<Entity[]> {
    const allEntities: Entity[] = [];
    let processed = 0;

    for (const chunk of chunks) {
      try {
        const entities = await this.extractFromChunk(chunk);
        allEntities.push(...entities);
      } catch (err) {
        console.warn(
          `[extractor] Failed to extract from ${chunk.filePath}:${chunk.lineStart}: ${err}`,
        );
      }

      processed++;
      options.onProgress?.(processed, chunks.length);

      // Rate limit: free tier is 15 RPM = 1 every 4 seconds
      if (processed < chunks.length) {
        await sleep(4500);
      }
    }

    return deduplicateEntities(allEntities);
  }

  /** Extract entities from a single chunk */
  private async extractFromChunk(chunk: FileChunk): Promise<Entity[]> {
    const prompt = buildEntityExtractionPrompt(chunk);
    const text = await this.provider.generateText(prompt, {
      temperature: 0.1,
      jsonMode: true,
    });

    try {
      const parsed = JSON.parse(text);
      const EntityArraySchema = z.array(
        z.object({
          name: z.string(),
          entityType: z.string(),
          description: z.string(),
        }),
      );
      const validated = EntityArraySchema.parse(parsed);

      return validated.map((e) => ({
        name: e.name,
        entityType: normalizeEntityType(e.entityType),
        description: e.description,
        sourceFile: chunk.filePath,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
      }));
    } catch {
      // If JSON parsing fails, try to extract from markdown code blocks
      return parseEntitiesFromText(text, chunk);
    }
  }

  /**
   * Extract relationships by analyzing import/dependency patterns.
   * Uses static analysis (regex) to avoid extra API calls.
   */
  extractRelationships(chunks: FileChunk[]): Relationship[] {
    const relationships: Relationship[] = [];

    for (const chunk of chunks) {
      const imports = extractImports(chunk);
      relationships.push(...imports);
    }

    return deduplicateRelationships(relationships);
  }

  /**
   * Generate insights and summary from extracted data.
   * Single API call with all entities + relationships.
   */
  async generateInsightsAndSummary(
    entities: Entity[],
    relationships: Relationship[],
    sourceDir: string,
  ): Promise<{ insights: string[]; summary: string }> {
    const entitySummary = entities
      .slice(0, 100)
      .map((e) => `- ${e.entityType}: ${e.name} (${e.sourceFile}) - ${e.description}`)
      .join("\n");

    const relSummary = relationships
      .slice(0, 50)
      .map((r) => `- ${r.source} ${r.relationType} ${r.target}`)
      .join("\n");

    const prompt = `You are analyzing a codebase from directory "${sourceDir}".

Here are the key entities found:
${entitySummary}

Here are the key relationships:
${relSummary}

Provide your analysis as a JSON object with:
1. "insights": An array of 5-10 key insights about the codebase architecture, patterns, conventions, and potential gotchas. Each insight should be a concise string.
2. "summary": A 2-3 paragraph human-readable summary of what this codebase does, its architecture, and key components.

Return ONLY valid JSON.`;

    try {
      const text = await this.provider.generateText(prompt, {
        temperature: 0.1,
        jsonMode: true,
      });
      const parsed = JSON.parse(text);

      const InsightsSchema = z.object({
        insights: z.array(z.string()),
        summary: z.string(),
      });

      return InsightsSchema.parse(parsed);
    } catch {
      return {
        insights: [
          `Codebase contains ${entities.length} entities across multiple files.`,
          `Found ${relationships.length} relationships between components.`,
        ],
        summary: `This codebase contains ${entities.length} identified entities with ${relationships.length} relationships. See the entities and relationships data for detailed structural information.`,
      };
    }
  }
}

// === Prompt Templates ===

function buildEntityExtractionPrompt(chunk: FileChunk): string {
  const langNote = chunk.language ? ` (${chunk.language})` : "";
  return `Analyze this code file${langNote}: "${chunk.filePath}" (lines ${chunk.lineStart}-${chunk.lineEnd}).

Extract all important entities: classes, functions, interfaces, types, constants, modules, and key concepts.

For each entity, provide:
- "name": the identifier name
- "entityType": one of "class", "function", "module", "variable", "concept", "interface", "type", "constant"
- "description": a concise 1-sentence description of what it does

Return a JSON array of entities. If no entities found, return [].

Code:
\`\`\`
${chunk.content.slice(0, 8000)}
\`\`\``;
}

// === Helpers ===

function normalizeEntityType(raw: string): Entity["entityType"] {
  const map: Record<string, Entity["entityType"]> = {
    class: "class",
    function: "function",
    method: "function",
    module: "module",
    variable: "variable",
    var: "variable",
    let: "variable",
    const: "constant",
    constant: "constant",
    concept: "concept",
    interface: "interface",
    type: "type",
    enum: "type",
  };
  return map[raw.toLowerCase()] ?? "concept";
}

function parseEntitiesFromText(text: string, chunk: FileChunk): Entity[] {
  // Fallback: try to extract JSON from markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        return parsed.map((e: Record<string, string>) => ({
          name: e.name ?? "unknown",
          entityType: normalizeEntityType(e.entityType ?? "concept"),
          description: e.description ?? "",
          sourceFile: chunk.filePath,
          lineStart: chunk.lineStart,
        }));
      }
    } catch {
      // Give up
    }
  }
  return [];
}

/** Extract import relationships using regex patterns */
function extractImports(chunk: FileChunk): Relationship[] {
  const relationships: Relationship[] = [];
  const lines = chunk.content.split("\n");

  for (const line of lines) {
    // TypeScript/JavaScript: import ... from "..."
    const tsImport = line.match(
      /import\s+(?:(?:\{[^}]*\}|[\w*]+)\s+from\s+)?["']([^"']+)["']/,
    );
    if (tsImport) {
      relationships.push({
        source: chunk.filePath,
        target: tsImport[1],
        relationType: "imports",
      });
    }

    // Python: from ... import ... / import ...
    const pyImport = line.match(/^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/);
    if (pyImport) {
      relationships.push({
        source: chunk.filePath,
        target: pyImport[1] ?? pyImport[2],
        relationType: "imports",
      });
    }

    // Solidity: import "..."
    const solImport = line.match(/import\s+["']([^"']+)["']/);
    if (solImport) {
      relationships.push({
        source: chunk.filePath,
        target: solImport[1],
        relationType: "imports",
      });
    }
  }

  return relationships;
}

function deduplicateEntities(entities: Entity[]): Entity[] {
  const seen = new Set<string>();
  return entities.filter((e) => {
    const key = `${e.name}:${e.sourceFile}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateRelationships(rels: Relationship[]): Relationship[] {
  const seen = new Set<string>();
  return rels.filter((r) => {
    const key = `${r.source}:${r.relationType}:${r.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
