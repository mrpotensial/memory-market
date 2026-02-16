import OpenAI from "openai";
import { getConfig } from "../config.js";
import type { AIProvider, GenerateOptions, EmbeddingResult, ToolDefinition, ToolCallResult } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenRouterProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private embeddingModel: string;
  private dimensions: number;

  constructor() {
    const config = getConfig();
    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: config.openrouterApiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/memory-markets",
        "X-Title": "Memory Markets",
      },
    });
    this.model = config.openrouterModel;
    this.embeddingModel = config.openrouterEmbeddingModel;
    this.dimensions = config.openrouterEmbeddingDimensions;
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2048,
      ...(options?.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    });

    return response.choices[0]?.message?.content ?? "";
  }

  async generateWithTools(
    prompt: string,
    tools: ToolDefinition[],
    options?: GenerateOptions,
  ): Promise<ToolCallResult> {
    // Convert ToolDefinition to OpenAI tool format
    const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object" as const,
          properties: Object.fromEntries(
            Object.entries(t.parameters).map(([key, val]) => [
              key,
              { type: val.type, description: val.description },
            ]),
          ),
          required: t.required,
        },
      },
    }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      tools: openaiTools,
      temperature: options?.temperature ?? 0.4,
      max_tokens: options?.maxTokens ?? 1024,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      return { type: "text", text: "No response from model" };
    }

    // Check for tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      if ("function" in toolCall) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        return {
          type: "function_call",
          functionName: toolCall.function.name,
          functionArgs: args,
        };
      }
    }

    // Text response
    return { type: "text", text: message.content ?? "" };
  }

  async embedOne(text: string): Promise<number[]> {
    const truncated = text.length > 10_000 ? text.slice(0, 10_000) : text;

    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: truncated,
    });

    return response.data[0].embedding;
  }

  async embedBatch(
    texts: string[],
    options?: { batchSize?: number; onProgress?: (done: number, total: number) => void },
  ): Promise<EmbeddingResult[]> {
    const batchSize = options?.batchSize ?? 50;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      try {
        // OpenAI SDK supports batch embedding natively
        const response = await this.client.embeddings.create({
          model: this.embeddingModel,
          input: batch.map((t) => (t.length > 10_000 ? t.slice(0, 10_000) : t)),
        });

        for (let j = 0; j < batch.length; j++) {
          results.push({
            text: batch[j],
            embedding: response.data[j].embedding,
          });
        }
      } catch {
        // Fallback: embed one by one
        for (const text of batch) {
          try {
            const embedding = await this.embedOne(text);
            results.push({ text, embedding });
          } catch {
            results.push({ text, embedding: new Array(this.dimensions).fill(0) });
          }
        }
      }

      options?.onProgress?.(Math.min(i + batchSize, texts.length), texts.length);

      if (i + batchSize < texts.length) {
        await sleep(300);
      }
    }

    return results;
  }

  getEmbeddingDimensions(): number {
    return this.dimensions;
  }
}
