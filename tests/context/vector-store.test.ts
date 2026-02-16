import { describe, it, expect, beforeEach } from "vitest";
import { join } from "path";
import { rmSync } from "fs";
import { LocalVectorStore, cosineSimilarity } from "../../src/context/vector-store.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const a = [1, 2, 3];
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it("returns 0 for zero vectors", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow("mismatch");
  });
});

describe("LocalVectorStore", () => {
  let store: LocalVectorStore;

  beforeEach(() => {
    store = new LocalVectorStore(3);
  });

  it("stores and retrieves vectors", () => {
    store.add("a", [1, 0, 0], { label: "x-axis" });
    expect(store.size).toBe(1);
    expect(store.has("a")).toBe(true);

    const entry = store.get("a");
    expect(entry?.embedding).toEqual([1, 0, 0]);
    expect(entry?.metadata.label).toBe("x-axis");
  });

  it("queries for most similar vectors", () => {
    store.add("x", [1, 0, 0]);
    store.add("y", [0, 1, 0]);
    store.add("z", [0, 0, 1]);
    store.add("xy", [0.7, 0.7, 0]);

    const results = store.query([1, 0.1, 0], 2);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe("x"); // Most similar to [1,0,0]
    expect(results[0].score).toBeGreaterThan(0.9);
  });

  it("rejects wrong dimension embeddings", () => {
    expect(() => store.add("bad", [1, 2, 3, 4])).toThrow("dimension mismatch");
  });

  it("rejects wrong dimension queries", () => {
    store.add("a", [1, 0, 0]);
    expect(() => store.query([1, 2], 1)).toThrow("dimension mismatch");
  });

  it("handles addBatch", () => {
    store.addBatch([
      { id: "a", embedding: [1, 0, 0], metadata: { n: 1 } },
      { id: "b", embedding: [0, 1, 0], metadata: { n: 2 } },
    ]);
    expect(store.size).toBe(2);
  });

  it("deletes entries", () => {
    store.add("a", [1, 0, 0]);
    expect(store.delete("a")).toBe(true);
    expect(store.size).toBe(0);
    expect(store.delete("nonexistent")).toBe(false);
  });

  it("clears all entries", () => {
    store.add("a", [1, 0, 0]);
    store.add("b", [0, 1, 0]);
    store.clear();
    expect(store.size).toBe(0);
  });

  describe("persistence", () => {
    const testFile = join(import.meta.dirname, "__test_vectors__.json");

    it("saves and loads correctly", () => {
      store.add("a", [1, 0, 0], { label: "x" });
      store.add("b", [0, 1, 0], { label: "y" });
      store.save(testFile);

      const loaded = LocalVectorStore.load(testFile);
      expect(loaded.size).toBe(2);
      expect(loaded.has("a")).toBe(true);
      expect(loaded.get("a")?.metadata.label).toBe("x");

      // Query should work on loaded store
      const results = loaded.query([1, 0.1, 0], 1);
      expect(results[0].id).toBe("a");

      // Clean up
      rmSync(testFile, { force: true });
    });
  });
});
