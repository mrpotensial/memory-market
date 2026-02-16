import { getAIProvider } from "../ai/index.js";
import type { AIProvider, EmbeddingResult } from "../ai/types.js";

// Re-export for backwards compatibility
export type { EmbeddingResult } from "../ai/types.js";

// === Embedder ===

/**
 * Generate text embeddings using the configured AI provider.
 * Handles batching and rate limiting.
 */
export class GeminiEmbedder {
  private provider: AIProvider;

  constructor() {
    this.provider = getAIProvider();
  }

  /** Embed a single text */
  async embedOne(text: string): Promise<number[]> {
    return this.provider.embedOne(text);
  }

  /**
   * Embed multiple texts in batches.
   */
  async embedBatch(
    texts: string[],
    options: { batchSize?: number; onProgress?: (done: number, total: number) => void } = {},
  ): Promise<EmbeddingResult[]> {
    return this.provider.embedBatch(texts, options);
  }

  /** Get the embedding dimensions */
  getDimensions(): number {
    return this.provider.getEmbeddingDimensions();
  }
}
