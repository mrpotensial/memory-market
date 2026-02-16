import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration } from "@google/generative-ai";
import { getConfig } from "../config.js";
import type { AIProvider, GenerateOptions, EmbeddingResult, ToolDefinition, ToolCallResult } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiProvider implements AIProvider {
  private genModel;
  private embModel;
  private dimensions: number;

  constructor() {
    const config = getConfig();
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);

    this.genModel = genAI.getGenerativeModel({
      model: config.geminiModel,
    });

    this.embModel = genAI.getGenerativeModel({
      model: config.geminiEmbeddingModel,
    });

    this.dimensions = config.geminiEmbeddingDimensions;
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    const model = this.genModel;
    const config: Record<string, unknown> = {};
    if (options?.temperature !== undefined) config.temperature = options.temperature;
    if (options?.maxTokens !== undefined) config.maxOutputTokens = options.maxTokens;
    if (options?.jsonMode) config.responseMimeType = "application/json";

    const genAI = new GoogleGenerativeAI(getConfig().geminiApiKey);
    const m = genAI.getGenerativeModel({
      model: getConfig().geminiModel,
      generationConfig: config,
    });

    const result = await m.generateContent(prompt);
    return result.response.text();
  }

  async generateWithTools(
    prompt: string,
    tools: ToolDefinition[],
    options?: GenerateOptions,
  ): Promise<ToolCallResult> {
    const genAI = new GoogleGenerativeAI(getConfig().geminiApiKey);
    const m = genAI.getGenerativeModel({
      model: getConfig().geminiModel,
      generationConfig: {
        temperature: options?.temperature ?? 0.4,
        maxOutputTokens: options?.maxTokens ?? 1024,
      },
    });

    // Convert ToolDefinition to Gemini FunctionDeclaration
    const functionDeclarations: FunctionDeclaration[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([key, val]) => [
            key,
            { type: schemaTypeMap(val.type), description: val.description },
          ]),
        ),
        required: t.required,
      },
    }));

    const result = await m.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ functionDeclarations }],
    });

    const candidate = result.response.candidates?.[0];
    if (!candidate?.content?.parts) {
      return { type: "text", text: "No response from model" };
    }

    for (const part of candidate.content.parts) {
      if (part.functionCall) {
        return {
          type: "function_call",
          functionName: part.functionCall.name,
          functionArgs: (part.functionCall.args as Record<string, unknown>) ?? {},
        };
      }
    }

    // Text response
    const text = candidate.content.parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join("\n");

    return { type: "text", text };
  }

  async embedOne(text: string): Promise<number[]> {
    const truncated = text.length > 10_000 ? text.slice(0, 10_000) : text;
    const result = await this.embModel.embedContent(truncated);
    return result.embedding.values;
  }

  async embedBatch(
    texts: string[],
    options?: { batchSize?: number; onProgress?: (done: number, total: number) => void },
  ): Promise<EmbeddingResult[]> {
    const batchSize = options?.batchSize ?? 50;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      for (const text of batch) {
        try {
          const embedding = await this.embedOne(text);
          results.push({ text, embedding });
        } catch {
          await sleep(2000);
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
        await sleep(500);
      }
    }

    return results;
  }

  getEmbeddingDimensions(): number {
    return this.dimensions;
  }
}

function schemaTypeMap(type: string): SchemaType {
  switch (type) {
    case "string": return SchemaType.STRING;
    case "number": return SchemaType.NUMBER;
    case "boolean": return SchemaType.BOOLEAN;
    case "object": return SchemaType.OBJECT;
    default: return SchemaType.STRING;
  }
}
