import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

describe("Config validation", () => {
  // We test the schema directly without importing the module
  // (which would trigger dotenv loading side effects)

  const ConfigSchema = z.object({
    geminiApiKey: z.string().min(1, "GEMINI_API_KEY is required"),
    geminiModel: z.string().default("gemini-2.0-flash"),
    geminiEmbeddingModel: z.string().default("text-embedding-004"),
    geminiEmbeddingDimensions: z.number().default(768),
    monadRpcUrl: z.string().url().default("https://testnet-rpc.monad.xyz"),
    monadChainId: z.number().default(10143),
    nadfunCoreAddress: z.string().default("0x822EB1ADD41cf87C3F178100596cf24c9a6442f6"),
    agentPrivateKey: z.string().optional(),
    dataDir: z.string().default(".memory-markets"),
  });

  it("accepts valid config with all required fields", () => {
    const config = ConfigSchema.parse({
      geminiApiKey: "test-api-key",
    });

    expect(config.geminiApiKey).toBe("test-api-key");
    expect(config.geminiModel).toBe("gemini-2.0-flash");
    expect(config.geminiEmbeddingDimensions).toBe(768);
  });

  it("rejects empty API key", () => {
    expect(() =>
      ConfigSchema.parse({ geminiApiKey: "" }),
    ).toThrow();
  });

  it("rejects missing API key", () => {
    expect(() =>
      ConfigSchema.parse({}),
    ).toThrow(); // Zod throws ZodError for missing required field
  });

  it("applies default values correctly", () => {
    const config = ConfigSchema.parse({
      geminiApiKey: "key",
    });

    expect(config.monadRpcUrl).toBe("https://testnet-rpc.monad.xyz");
    expect(config.monadChainId).toBe(10143);
    expect(config.dataDir).toBe(".memory-markets");
    expect(config.nadfunCoreAddress).toBe("0x822EB1ADD41cf87C3F178100596cf24c9a6442f6");
  });

  it("allows optional agentPrivateKey", () => {
    const config = ConfigSchema.parse({
      geminiApiKey: "key",
    });

    expect(config.agentPrivateKey).toBeUndefined();
  });

  it("accepts custom values that override defaults", () => {
    const config = ConfigSchema.parse({
      geminiApiKey: "key",
      geminiModel: "gemini-1.5-pro",
      monadChainId: 99999,
      dataDir: "/custom/path",
    });

    expect(config.geminiModel).toBe("gemini-1.5-pro");
    expect(config.monadChainId).toBe(99999);
    expect(config.dataDir).toBe("/custom/path");
  });

  it("rejects invalid RPC URL format", () => {
    expect(() =>
      ConfigSchema.parse({
        geminiApiKey: "key",
        monadRpcUrl: "not-a-url",
      }),
    ).toThrow();
  });

  it("accepts valid RPC URL", () => {
    const config = ConfigSchema.parse({
      geminiApiKey: "key",
      monadRpcUrl: "https://custom-rpc.example.com",
    });

    expect(config.monadRpcUrl).toBe("https://custom-rpc.example.com");
  });
});
