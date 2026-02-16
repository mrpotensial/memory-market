import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { rmSync } from "fs";
import { MarketplaceRegistry } from "../../src/marketplace/registry.js";
import { MarketplaceSearch } from "../../src/marketplace/search.js";

describe("MarketplaceSearch", () => {
  const testDbPath = join(import.meta.dirname, "__test_search__.db");
  let registry: MarketplaceRegistry;
  let search: MarketplaceSearch;

  const packages = [
    {
      id: "ctx_ts01",
      name: "TypeScript Guide",
      description: "Complete TypeScript handbook with best practices",
      tags: "typescript,guide,patterns",
      priceMon: 1.0,
      tokenAddress: null,
      curveAddress: null,
      creatorAddress: "0x1111",
      packagePath: "/path/ts.mmctx",
      fileCount: 20,
      chunkCount: 50,
      entityCount: 30,
    },
    {
      id: "ctx_sol02",
      name: "Solidity Smart Contracts",
      description: "Advanced Solidity patterns for DeFi",
      tags: "solidity,blockchain,defi",
      priceMon: 2.5,
      tokenAddress: "0xtoken1",
      curveAddress: "0xcurve1",
      creatorAddress: "0x2222",
      packagePath: "/path/sol.mmctx",
      fileCount: 15,
      chunkCount: 30,
      entityCount: 20,
    },
    {
      id: "ctx_py03",
      name: "Python Machine Learning",
      description: "ML pipeline with scikit-learn and PyTorch",
      tags: "python,ml,ai",
      priceMon: 3.0,
      tokenAddress: null,
      curveAddress: null,
      creatorAddress: "0x3333",
      packagePath: "/path/py.mmctx",
      fileCount: 25,
      chunkCount: 60,
      entityCount: 45,
    },
  ];

  beforeEach(async () => {
    rmSync(testDbPath, { force: true });
    registry = new MarketplaceRegistry(testDbPath);
    await registry.init();

    for (const pkg of packages) {
      registry.listPackage(pkg);
    }

    search = new MarketplaceSearch(registry);
  });

  afterEach(() => {
    registry.close();
    rmSync(testDbPath, { force: true });
  });

  describe("keywordSearch", () => {
    it("finds packages by name keyword", () => {
      const results = search.keywordSearch("TypeScript");
      expect(results.length).toBe(1);
      expect(results[0].listing.id).toBe("ctx_ts01");
      expect(results[0].matchType).toBe("keyword");
    });

    it("finds packages by description keyword", () => {
      const results = search.keywordSearch("DeFi");
      expect(results.length).toBe(1);
      expect(results[0].listing.id).toBe("ctx_sol02");
    });

    it("finds packages by tag keyword", () => {
      const results = search.keywordSearch("python");
      expect(results.length).toBe(1);
      expect(results[0].listing.id).toBe("ctx_py03");
    });

    it("returns empty for no matches", () => {
      const results = search.keywordSearch("rust");
      expect(results.length).toBe(0);
    });

    it("is case-insensitive", () => {
      const results = search.keywordSearch("typescript");
      expect(results.length).toBe(1);
    });

    it("finds multiple matches", () => {
      // "patterns" is in TypeScript tags AND Solidity description ("patterns")
      const results = search.keywordSearch("patterns");
      expect(results.length).toBe(2);
    });

    it("assigns decreasing scores by position", () => {
      const results = search.keywordSearch("patterns");
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });
  });

  describe("search (combined)", () => {
    it("falls back to keyword-only when no embedder", async () => {
      const results = await search.search("TypeScript");
      expect(results.length).toBe(1);
      expect(results[0].matchType).toBe("keyword");
    });

    it("respects limit parameter", async () => {
      // "a" should match multiple packages in description
      const results = await search.search("guide", 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("returns empty for no matches", async () => {
      const results = await search.search("nonexistent_term_xyz");
      expect(results.length).toBe(0);
    });
  });
});
