import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { ContextPackage, FileChunk } from "./models.js";
import { PackageMetadataSchema } from "./models.js";
import { scanDirectory, type ScanOptions } from "./scanner.js";
import { GeminiExtractor } from "./extractor.js";
import { GeminiEmbedder } from "./embedder.js";
import { LocalVectorStore } from "./vector-store.js";

// === Types ===

export interface ExportOptions {
  /** Package name */
  name: string;
  /** Package description */
  description?: string;
  /** Tags for search */
  tags?: string[];
  /** Scanner options */
  scanOptions?: ScanOptions;
  /** Progress callback */
  onProgress?: (stage: string, done: number, total: number) => void;
}

export interface ExportResult {
  /** Path to the created .mmctx directory */
  outputDir: string;
  /** The full context package */
  package: ContextPackage;
  /** Stats */
  stats: {
    filesScanned: number;
    chunksCreated: number;
    entitiesExtracted: number;
    relationshipsFound: number;
    embeddingsGenerated: number;
  };
}

// === Exporter ===

/**
 * Export a directory into a .mmctx knowledge package.
 *
 * Pipeline: scan -> extract entities -> map relationships -> embed -> generate insights -> save
 */
export async function exportDirectory(
  sourceDir: string,
  options: ExportOptions,
): Promise<ExportResult> {
  const { onProgress } = options;

  // Step 1: Scan directory for source files and create chunks
  onProgress?.("Scanning files", 0, 1);
  const chunks = scanDirectory(sourceDir, options.scanOptions);
  onProgress?.("Scanning files", 1, 1);

  if (chunks.length === 0) {
    throw new Error(
      `No files found in "${sourceDir}". Check that the directory exists and contains supported file types.`,
    );
  }

  // Count unique files
  const uniqueFiles = new Set(chunks.map((c) => c.filePath));

  // Step 2: Extract entities using Gemini
  onProgress?.("Extracting entities", 0, chunks.length);
  const extractor = new GeminiExtractor();
  const entities = await extractor.extractEntities(chunks, {
    onProgress: (done, total) => onProgress?.("Extracting entities", done, total),
  });

  // Step 3: Extract relationships (static analysis, no API needed)
  onProgress?.("Mapping relationships", 0, 1);
  const relationships = extractor.extractRelationships(chunks);
  onProgress?.("Mapping relationships", 1, 1);

  // Step 4: Generate embeddings
  onProgress?.("Generating embeddings", 0, chunks.length);
  const embedder = new GeminiEmbedder();
  const textsToEmbed = chunks.map((c) => buildEmbeddingText(c));
  const embeddingResults = await embedder.embedBatch(textsToEmbed, {
    onProgress: (done, total) => onProgress?.("Generating embeddings", done, total),
  });

  // Step 5: Store embeddings in vector store
  const vectorStore = new LocalVectorStore(embedder.getDimensions());
  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `chunk_${i.toString().padStart(4, "0")}`;
    vectorStore.add(chunkId, embeddingResults[i].embedding, {
      filePath: chunks[i].filePath,
      chunkIndex: chunks[i].chunkIndex,
      lineStart: chunks[i].lineStart,
      lineEnd: chunks[i].lineEnd,
      contentPreview: chunks[i].content.slice(0, 200),
    });
  }

  // Step 6: Generate insights and summary
  onProgress?.("Generating insights", 0, 1);
  const { insights, summary } = await extractor.generateInsightsAndSummary(
    entities,
    relationships,
    sourceDir,
  );
  onProgress?.("Generating insights", 1, 1);

  // Step 7: Build the context package
  const metadata = PackageMetadataSchema.parse({
    name: options.name,
    description: options.description ?? `Knowledge package exported from ${sourceDir}`,
    sourceDir,
    fileCount: uniqueFiles.size,
    chunkCount: chunks.length,
    entityCount: entities.length,
    tags: options.tags ?? [],
  });

  const contextPackage: ContextPackage = {
    metadata,
    entities,
    relationships,
    insights,
    summary,
    sampleQueries: [],
  };

  // Step 8: Save to .mmctx directory
  onProgress?.("Saving package", 0, 1);
  const outputDir = `${options.name}.mmctx`;
  savePackage(outputDir, contextPackage, chunks, vectorStore);
  onProgress?.("Saving package", 1, 1);

  return {
    outputDir,
    package: contextPackage,
    stats: {
      filesScanned: uniqueFiles.size,
      chunksCreated: chunks.length,
      entitiesExtracted: entities.length,
      relationshipsFound: relationships.length,
      embeddingsGenerated: embeddingResults.length,
    },
  };
}

// === Save Logic ===

/** Save a context package to a .mmctx directory */
function savePackage(
  outputDir: string,
  pkg: ContextPackage,
  chunks: FileChunk[],
  vectorStore: LocalVectorStore,
): void {
  // Create directory structure
  mkdirSync(join(outputDir, "chunks"), { recursive: true });

  // Save metadata
  writeFileSync(
    join(outputDir, "metadata.json"),
    JSON.stringify(pkg.metadata, null, 2),
    "utf-8",
  );

  // Save full package (without raw chunks to keep it smaller)
  writeFileSync(
    join(outputDir, "package.json"),
    JSON.stringify(pkg, null, 2),
    "utf-8",
  );

  // Save human-readable summary
  writeFileSync(
    join(outputDir, "summary.md"),
    buildSummaryMarkdown(pkg),
    "utf-8",
  );

  // Save chunks individually
  for (let i = 0; i < chunks.length; i++) {
    writeFileSync(
      join(outputDir, "chunks", `chunk_${i.toString().padStart(4, "0")}.json`),
      JSON.stringify(chunks[i], null, 2),
      "utf-8",
    );
  }

  // Save vector store
  vectorStore.save(join(outputDir, "vectors.json"));
}

// === Helpers ===

/** Build text for embedding from a file chunk (includes file path for context) */
function buildEmbeddingText(chunk: FileChunk): string {
  const header = `File: ${chunk.filePath} (lines ${chunk.lineStart}-${chunk.lineEnd})`;
  return `${header}\n\n${chunk.content}`;
}

/** Build a markdown summary document */
function buildSummaryMarkdown(pkg: ContextPackage): string {
  let md = `# ${pkg.metadata.name}\n\n`;
  md += `${pkg.summary}\n\n`;
  md += `## Stats\n\n`;
  md += `- **Files**: ${pkg.metadata.fileCount}\n`;
  md += `- **Chunks**: ${pkg.metadata.chunkCount}\n`;
  md += `- **Entities**: ${pkg.metadata.entityCount}\n`;
  md += `- **Tags**: ${pkg.metadata.tags.join(", ") || "none"}\n\n`;

  if (pkg.insights.length > 0) {
    md += `## Key Insights\n\n`;
    for (const insight of pkg.insights) {
      md += `- ${insight}\n`;
    }
    md += "\n";
  }

  if (pkg.entities.length > 0) {
    md += `## Key Entities\n\n`;
    for (const entity of pkg.entities.slice(0, 30)) {
      md += `- **${entity.name}** (${entity.entityType}): ${entity.description}\n`;
    }
    if (pkg.entities.length > 30) {
      md += `- ... and ${pkg.entities.length - 30} more\n`;
    }
  }

  return md;
}
