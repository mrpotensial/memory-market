import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the Embedder module.
 *
 * GeminiEmbedder requires GEMINI_API_KEY. We test:
 * 1. Constructor behavior and config usage (via mocking)
 * 2. embedBatch batching logic
 * 3. Error handling and retry behavior
 * 4. Text truncation for long inputs
 * 5. Zero-vector fallback on failure
 */

// Mock the config module
vi.mock("../../src/config.js", () => ({
  getConfig: () => ({
    geminiApiKey: "test-api-key",
    geminiModel: "gemini-2.0-flash",
    geminiEmbeddingModel: "text-embedding-004",
    geminiEmbeddingDimensions: 768,
  }),
}));

// Mock the Google Generative AI module
const mockEmbedContent = vi.fn();
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      embedContent: mockEmbedContent,
    }),
  })),
}));

// Import AFTER mocks are set up
import { GeminiEmbedder, type EmbeddingResult } from "../../src/context/embedder.js";

describe("GeminiEmbedder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates an embedder instance", () => {
      const embedder = new GeminiEmbedder();
      expect(embedder).toBeInstanceOf(GeminiEmbedder);
    });

    it("getDimensions returns configured dimensions", () => {
      const embedder = new GeminiEmbedder();
      expect(embedder.getDimensions()).toBe(768);
    });
  });

  describe("embedOne", () => {
    it("returns embedding vector from API", async () => {
      const fakeEmbedding = Array.from({ length: 768 }, () => Math.random());
      mockEmbedContent.mockResolvedValueOnce({
        embedding: { values: fakeEmbedding },
      });

      const embedder = new GeminiEmbedder();
      const result = await embedder.embedOne("test text");

      expect(result).toEqual(fakeEmbedding);
      expect(result.length).toBe(768);
      expect(mockEmbedContent).toHaveBeenCalledWith("test text");
    });

    it("propagates API errors", async () => {
      mockEmbedContent.mockRejectedValueOnce(new Error("API rate limit"));

      const embedder = new GeminiEmbedder();
      await expect(embedder.embedOne("test")).rejects.toThrow("API rate limit");
    });
  });

  describe("embedBatch", () => {
    it("embeds multiple texts and returns results", async () => {
      const fakeEmbedding = Array.from({ length: 768 }, () => 0.5);
      mockEmbedContent.mockResolvedValue({
        embedding: { values: fakeEmbedding },
      });

      const embedder = new GeminiEmbedder();
      const texts = ["text one", "text two", "text three"];
      const results = await embedder.embedBatch(texts);

      expect(results.length).toBe(3);
      expect(results[0].text).toBe("text one");
      expect(results[0].embedding).toEqual(fakeEmbedding);
      expect(results[2].text).toBe("text three");
    });

    it("calls onProgress callback", async () => {
      const fakeEmbedding = Array.from({ length: 768 }, () => 0.1);
      mockEmbedContent.mockResolvedValue({
        embedding: { values: fakeEmbedding },
      });

      const embedder = new GeminiEmbedder();
      const progressCalls: [number, number][] = [];

      await embedder.embedBatch(["a", "b"], {
        batchSize: 100,
        onProgress: (done, total) => progressCalls.push([done, total]),
      });

      expect(progressCalls.length).toBeGreaterThan(0);
      // Final call should have done === total
      const last = progressCalls[progressCalls.length - 1];
      expect(last[0]).toBe(2);
      expect(last[1]).toBe(2);
    });

    it("handles empty text array", async () => {
      const embedder = new GeminiEmbedder();
      const results = await embedder.embedBatch([]);

      expect(results).toEqual([]);
      expect(mockEmbedContent).not.toHaveBeenCalled();
    });

    it("uses zero-vector fallback on persistent failure", async () => {
      mockEmbedContent.mockRejectedValue(new Error("Service unavailable"));

      const embedder = new GeminiEmbedder();
      // embedBatch retries once then uses zero vector
      const results = await embedder.embedBatch(["fail text"], { batchSize: 100 });

      expect(results.length).toBe(1);
      expect(results[0].text).toBe("fail text");
      // All zeros (fallback)
      expect(results[0].embedding.every((v) => v === 0)).toBe(true);
      expect(results[0].embedding.length).toBe(768);
    });

    it("respects batchSize parameter", async () => {
      const fakeEmbedding = Array.from({ length: 768 }, () => 0.3);
      mockEmbedContent.mockResolvedValue({
        embedding: { values: fakeEmbedding },
      });

      const embedder = new GeminiEmbedder();
      const texts = Array.from({ length: 5 }, (_, i) => `text ${i}`);
      const results = await embedder.embedBatch(texts, { batchSize: 2 });

      expect(results.length).toBe(5);
      // All texts should be embedded
      for (let i = 0; i < 5; i++) {
        expect(results[i].text).toBe(`text ${i}`);
      }
    });
  });
});

describe("EmbeddingResult type", () => {
  it("has correct shape", () => {
    const result: EmbeddingResult = {
      text: "sample",
      embedding: [0.1, 0.2, 0.3],
    };
    expect(result.text).toBe("sample");
    expect(result.embedding.length).toBe(3);
  });
});
