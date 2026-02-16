import { z } from "zod";
import { randomUUID } from "crypto";

// === Enums ===

export const EntityType = z.enum([
  "class",
  "function",
  "module",
  "variable",
  "concept",
  "interface",
  "type",
  "constant",
]);
export type EntityType = z.infer<typeof EntityType>;

export const RelationType = z.enum([
  "imports",
  "calls",
  "inherits",
  "implements",
  "uses",
  "contains",
  "depends_on",
]);
export type RelationType = z.infer<typeof RelationType>;

// === Core Schemas ===

export const EntitySchema = z.object({
  name: z.string().min(1),
  entityType: EntityType,
  description: z.string(),
  sourceFile: z.string(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const RelationshipSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  relationType: RelationType,
  description: z.string().optional(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const FileChunkSchema = z.object({
  filePath: z.string().min(1),
  content: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  totalChunks: z.number().int().positive(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  language: z.string().optional(),
});
export type FileChunk = z.infer<typeof FileChunkSchema>;

export const SampleQuerySchema = z.object({
  question: z.string().min(1),
  expectedAnswer: z.string().min(1),
  category: z.string().default("general"),
});
export type SampleQuery = z.infer<typeof SampleQuerySchema>;

export const PackageMetadataSchema = z.object({
  id: z.string().default(() => `ctx_${randomUUID().replace(/-/g, "").slice(0, 12)}`),
  name: z.string().min(1),
  description: z.string().default(""),
  createdAt: z.string().default(() => new Date().toISOString()),
  sourceDir: z.string(),
  fileCount: z.number().int().nonnegative().default(0),
  chunkCount: z.number().int().nonnegative().default(0),
  entityCount: z.number().int().nonnegative().default(0),
  tags: z.array(z.string()).default([]),
  priceMon: z.number().nonnegative().default(0),
  tokenAddress: z.string().optional(),
  accuracyScore: z.number().min(0).max(1).optional(),
});
export type PackageMetadata = z.infer<typeof PackageMetadataSchema>;

export const ContextPackageSchema = z.object({
  metadata: PackageMetadataSchema,
  entities: z.array(EntitySchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
  insights: z.array(z.string()).default([]),
  summary: z.string().default(""),
  sampleQueries: z.array(SampleQuerySchema).default([]),
});
export type ContextPackage = z.infer<typeof ContextPackageSchema>;

// === Helpers ===

/** Map file extensions to language identifiers */
export function detectLanguage(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    py: "python",
    js: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    sol: "solidity",
    rs: "rust",
    go: "go",
    java: "java",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
  };
  return ext ? langMap[ext] : undefined;
}
