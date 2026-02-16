import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

// === Types ===

export interface VectorEntry {
  id: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface StoredData {
  entries: VectorEntry[];
  dimensions: number;
}

// === Vector Store ===

/**
 * Simple local vector store using JSON persistence + cosine similarity.
 * Sufficient for hackathon scale (hundreds of vectors, not millions).
 * Implements the same interface pattern as ChromaDB for easy swapping later.
 */
export class LocalVectorStore {
  private entries: Map<string, VectorEntry> = new Map();
  private dimensions: number;

  constructor(dimensions: number = 768) {
    this.dimensions = dimensions;
  }

  /** Add a vector with metadata */
  add(id: string, embedding: number[], metadata: Record<string, unknown> = {}): void {
    if (embedding.length !== this.dimensions) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimensions}, got ${embedding.length}`,
      );
    }
    this.entries.set(id, { id, embedding, metadata });
  }

  /** Add multiple vectors at once */
  addBatch(
    items: { id: string; embedding: number[]; metadata?: Record<string, unknown> }[],
  ): void {
    for (const item of items) {
      this.add(item.id, item.embedding, item.metadata ?? {});
    }
  }

  /** Query for the top-K most similar vectors */
  query(embedding: number[], topK: number = 5): SearchResult[] {
    if (embedding.length !== this.dimensions) {
      throw new Error(
        `Query embedding dimension mismatch: expected ${this.dimensions}, got ${embedding.length}`,
      );
    }

    const scored: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      const score = cosineSimilarity(embedding, entry.embedding);
      scored.push({ id: entry.id, score, metadata: entry.metadata });
    }

    // Sort by score descending and return top K
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** Get total number of stored vectors */
  get size(): number {
    return this.entries.size;
  }

  /** Save vector store to a JSON file */
  save(filePath: string): void {
    const data: StoredData = {
      entries: Array.from(this.entries.values()),
      dimensions: this.dimensions,
    };

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data), "utf-8");
  }

  /** Load vector store from a JSON file */
  static load(filePath: string): LocalVectorStore {
    const raw = readFileSync(filePath, "utf-8");
    const data: StoredData = JSON.parse(raw);

    const store = new LocalVectorStore(data.dimensions);
    for (const entry of data.entries) {
      store.entries.set(entry.id, entry);
    }

    return store;
  }

  /** Check if an ID exists in the store */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Get a specific entry by ID */
  get(id: string): VectorEntry | undefined {
    return this.entries.get(id);
  }

  /** Remove an entry by ID */
  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  /** Clear all entries */
  clear(): void {
    this.entries.clear();
  }
}

// === Math Utilities ===

/** Compute cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
