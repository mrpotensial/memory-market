import { MarketplaceRegistry, type PackageListing } from "./registry.js";
import { GeminiEmbedder } from "../context/embedder.js";
import { LocalVectorStore } from "../context/vector-store.js";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// === Types ===

export interface SearchResult {
  listing: PackageListing;
  score: number;
  matchType: "keyword" | "semantic" | "combined";
}

// === Search Engine ===

/**
 * Combined keyword + semantic search for the marketplace.
 * Uses SQLite LIKE for keyword matching and embeddings for semantic similarity.
 */
export class MarketplaceSearch {
  private registry: MarketplaceRegistry;
  private summaryStore: LocalVectorStore | null = null;
  private embedder: GeminiEmbedder | null = null;

  constructor(registry: MarketplaceRegistry) {
    this.registry = registry;
  }

  /**
   * Search the marketplace.
   * Tries keyword search first (fast, no API needed).
   * If embedder is available, also does semantic search and combines results.
   */
  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    // Keyword search (always available)
    const keywordResults = this.keywordSearch(query);

    // Semantic search (optional, needs embedder + summary embeddings)
    let semanticResults: SearchResult[] = [];
    if (this.embedder && this.summaryStore && this.summaryStore.size > 0) {
      semanticResults = await this.semanticSearch(query, limit);
    }

    // Combine results
    if (semanticResults.length === 0) {
      return keywordResults.slice(0, limit);
    }

    return this.combineResults(keywordResults, semanticResults, limit);
  }

  /** Pure keyword search via SQLite LIKE */
  keywordSearch(query: string): SearchResult[] {
    const listings = this.registry.searchByKeyword(query);

    return listings.map((listing, index) => ({
      listing,
      // Score based on position (SQLite already orders by times_sold DESC)
      score: 1.0 - index * 0.05,
      matchType: "keyword" as const,
    }));
  }

  /** Semantic search using embeddings */
  async semanticSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
    if (!this.embedder || !this.summaryStore) {
      return [];
    }

    const queryEmbedding = await this.embedder.embedOne(query);
    const results = this.summaryStore.query(queryEmbedding, limit);

    const searchResults: SearchResult[] = [];
    for (const result of results) {
      const packageId = result.metadata?.packageId as string | undefined;
      if (!packageId) continue;

      const listing = this.registry.getPackage(packageId);
      if (!listing) continue;

      searchResults.push({
        listing,
        score: result.score,
        matchType: "semantic",
      });
    }

    return searchResults;
  }

  /**
   * Index a package's summary for semantic search.
   * Call this when a new package is listed.
   */
  async indexPackageSummary(
    packageId: string,
    summaryText: string,
  ): Promise<void> {
    if (!this.embedder) {
      this.embedder = new GeminiEmbedder();
    }

    if (!this.summaryStore) {
      this.summaryStore = new LocalVectorStore(this.embedder.getDimensions());

      // Try loading existing index
      const indexPath = this.getSummaryIndexPath();
      if (existsSync(indexPath)) {
        this.summaryStore = LocalVectorStore.load(indexPath);
      }
    }

    const embedding = await this.embedder.embedOne(summaryText);
    this.summaryStore.add(packageId, embedding, { packageId });

    // Persist the index
    this.summaryStore.save(this.getSummaryIndexPath());
  }

  /** Load the summary index from disk */
  loadSummaryIndex(): void {
    const indexPath = this.getSummaryIndexPath();
    if (existsSync(indexPath)) {
      this.summaryStore = LocalVectorStore.load(indexPath);
    }
  }

  /** Combine keyword and semantic results with weighted scoring */
  private combineResults(
    keyword: SearchResult[],
    semantic: SearchResult[],
    limit: number,
  ): SearchResult[] {
    const scoreMap = new Map<string, { listing: PackageListing; keywordScore: number; semanticScore: number }>();

    const KEYWORD_WEIGHT = 0.4;
    const SEMANTIC_WEIGHT = 0.6;

    for (const r of keyword) {
      scoreMap.set(r.listing.id, {
        listing: r.listing,
        keywordScore: r.score,
        semanticScore: 0,
      });
    }

    for (const r of semantic) {
      const existing = scoreMap.get(r.listing.id);
      if (existing) {
        existing.semanticScore = r.score;
      } else {
        scoreMap.set(r.listing.id, {
          listing: r.listing,
          keywordScore: 0,
          semanticScore: r.score,
        });
      }
    }

    const combined: SearchResult[] = [];
    for (const [, entry] of scoreMap) {
      const score =
        entry.keywordScore * KEYWORD_WEIGHT +
        entry.semanticScore * SEMANTIC_WEIGHT;
      combined.push({
        listing: entry.listing,
        score,
        matchType: entry.keywordScore > 0 && entry.semanticScore > 0
          ? "combined"
          : entry.keywordScore > 0
            ? "keyword"
            : "semantic",
      });
    }

    combined.sort((a, b) => b.score - a.score);
    return combined.slice(0, limit);
  }

  private getSummaryIndexPath(): string {
    const dataDir = join(homedir(), ".memory-markets");
    return join(dataDir, "summary-index.json");
  }
}
