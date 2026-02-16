// === AI Provider Abstraction Types ===

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
}

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object";
  description: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  required: string[];
}

export interface ToolCallResult {
  type: "function_call" | "text";
  functionName?: string;
  functionArgs?: Record<string, unknown>;
  text?: string;
}

/** Unified AI provider interface */
export interface AIProvider {
  /** Generate text completion */
  generateText(prompt: string, options?: GenerateOptions): Promise<string>;

  /** Generate with function/tool calling */
  generateWithTools(
    prompt: string,
    tools: ToolDefinition[],
    options?: GenerateOptions,
  ): Promise<ToolCallResult>;

  /** Embed a single text */
  embedOne(text: string): Promise<number[]>;

  /** Embed multiple texts */
  embedBatch(
    texts: string[],
    options?: { batchSize?: number; onProgress?: (done: number, total: number) => void },
  ): Promise<EmbeddingResult[]>;

  /** Get embedding dimensions for this provider */
  getEmbeddingDimensions(): number;
}
