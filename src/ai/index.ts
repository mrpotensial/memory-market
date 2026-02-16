export type { AIProvider, GenerateOptions, EmbeddingResult, ToolDefinition, ToolParameter, ToolCallResult } from "./types.js";
export { GeminiProvider } from "./gemini.js";
export { OpenRouterProvider } from "./openrouter.js";

import { getConfig } from "../config.js";
import type { AIProvider } from "./types.js";
import { GeminiProvider } from "./gemini.js";
import { OpenRouterProvider } from "./openrouter.js";

let _provider: AIProvider | null = null;

/** Get the singleton AI provider based on config */
export function getAIProvider(): AIProvider {
  if (!_provider) {
    const config = getConfig();
    if (config.aiProvider === "openrouter") {
      _provider = new OpenRouterProvider();
    } else {
      _provider = new GeminiProvider();
    }
  }
  return _provider;
}

/** Reset provider (useful for testing) */
export function resetAIProvider(): void {
  _provider = null;
}
