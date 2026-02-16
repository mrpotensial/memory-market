import { z } from "zod";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env from project root
config({ path: resolve(import.meta.dirname, "..", ".env") });

// === Network-specific defaults ===

const TESTNET_DEFAULTS = {
  monadRpcUrl: "https://testnet-rpc.monad.xyz",
  nadfunCoreAddress: "0x822EB1ADD41cf87C3F178100596cf24c9a6442f6",
  nadfunBondingCurveFactory: "0x60216FB3285595F4643f9f7cddAB842E799BD642",
  nadfunUniswapRouter: "0x619d07287e87C9c643C60882cA80d23C8ed44652",
  nadfunUniswapFactory: "0x13eD0D5e1567684D964469cCbA8A977CDA580827",
  nadfunWmon: "0x3bb9AFB94c82752E47706A10779EA525Cf95dc27",
  nadfunApiUrl: "https://testnet-bot-api-server.nad.fun",
  erc8004IdentityAddress: "0x230ce2878e025a807ba7a20a8e5094ad8fe3c669",
  erc8004ReputationAddress: "0xfb7df6ee2ec5c27e620b8926611567bb48d13ee5",
  x402Network: "eip155:10143",
};

const MAINNET_DEFAULTS = {
  monadRpcUrl: "https://rpc.monad.xyz",
  nadfunCoreAddress: "0x6F6B8F1a20703309951a5127c45B49b1CD981A22",  // BondingCurveRouter
  nadfunBondingCurveFactory: "0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE",  // BondingCurve
  nadfunUniswapRouter: "0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137",  // DEX Router
  nadfunUniswapFactory: "0x6B5F564339DbAD6b780249827f2198a841FEB7F3",  // DEX Factory
  nadfunWmon: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
  nadfunApiUrl: "https://api.nadapp.net",
  erc8004IdentityAddress: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",  // Official
  erc8004ReputationAddress: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",  // Official
  x402Network: "eip155:143",
};

function getNetworkDefaults(chainId: number) {
  return chainId === 143 ? MAINNET_DEFAULTS : TESTNET_DEFAULTS;
}

const ConfigSchema = z.object({
  // AI Provider Selection
  aiProvider: z.enum(["gemini", "openrouter"]).default("gemini"),

  // Gemini (used when aiProvider = "gemini")
  geminiApiKey: z.string().default(""),
  geminiModel: z.string().default("gemini-2.0-flash"),
  geminiEmbeddingModel: z.string().default("text-embedding-004"),
  geminiEmbeddingDimensions: z.number().default(768),

  // OpenRouter (used when aiProvider = "openrouter")
  openrouterApiKey: z.string().default(""),
  openrouterModel: z.string().default("openai/gpt-4o-mini"),
  openrouterEmbeddingModel: z.string().default("openai/text-embedding-3-small"),
  openrouterEmbeddingDimensions: z.number().default(1536),

  // Monad Network
  monadRpcUrl: z.string().url(),
  monadChainId: z.number().default(10143),

  // Nad.fun Contracts (network-aware defaults applied in loadConfig)
  nadfunCoreAddress: z.string(),
  nadfunBondingCurveFactory: z.string(),
  nadfunUniswapRouter: z.string(),
  nadfunUniswapFactory: z.string(),
  nadfunWmon: z.string(),
  nadfunApiUrl: z.string().url(),

  // ERC-8004 (Trustless Agents)
  // Testnet: custom deploy | Mainnet: official canonical addresses
  erc8004IdentityAddress: z.string(),
  erc8004ReputationAddress: z.string(),

  // X402 Payment Protocol
  x402FacilitatorUrl: z.string().url().default("https://x402-facilitator.molandak.org"),
  x402PayTo: z.string().optional(),
  x402Network: z.string(),

  // Moltbook (social network for AI agents)
  moltbookApiKey: z.string().optional(),
  moltbookApiUrl: z.string().url().default("https://www.moltbook.com/api/v1"),
  moltbookDefaultSubmolt: z.string().default("MemoryMarkets"),

  // Agent
  agentPrivateKey: z.string().optional(),

  // Storage
  dataDir: z.string().default(".memory-markets"),
}).superRefine((data, ctx) => {
  if (data.aiProvider === "gemini" && !data.geminiApiKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "GEMINI_API_KEY is required when AI_PROVIDER=gemini",
      path: ["geminiApiKey"],
    });
  }
  if (data.aiProvider === "openrouter" && !data.openrouterApiKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter",
      path: ["openrouterApiKey"],
    });
  }
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const chainId = process.env.MONAD_CHAIN_ID
    ? parseInt(process.env.MONAD_CHAIN_ID, 10)
    : 10143;
  const defaults = getNetworkDefaults(chainId);

  const raw = {
    aiProvider: process.env.AI_PROVIDER,
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    geminiModel: process.env.GEMINI_MODEL,
    geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL,
    geminiEmbeddingDimensions: process.env.GEMINI_EMBEDDING_DIMENSIONS
      ? parseInt(process.env.GEMINI_EMBEDDING_DIMENSIONS, 10)
      : undefined,
    openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
    openrouterModel: process.env.OPENROUTER_MODEL,
    openrouterEmbeddingModel: process.env.OPENROUTER_EMBEDDING_MODEL,
    openrouterEmbeddingDimensions: process.env.OPENROUTER_EMBEDDING_DIMENSIONS
      ? parseInt(process.env.OPENROUTER_EMBEDDING_DIMENSIONS, 10)
      : undefined,
    monadRpcUrl: process.env.MONAD_RPC_URL || defaults.monadRpcUrl,
    monadChainId: chainId,
    nadfunCoreAddress: process.env.NADFUN_CORE_ADDRESS || defaults.nadfunCoreAddress,
    nadfunBondingCurveFactory: process.env.NADFUN_BONDING_CURVE_FACTORY || defaults.nadfunBondingCurveFactory,
    nadfunUniswapRouter: process.env.NADFUN_UNISWAP_ROUTER || defaults.nadfunUniswapRouter,
    nadfunUniswapFactory: process.env.NADFUN_UNISWAP_FACTORY || defaults.nadfunUniswapFactory,
    nadfunWmon: process.env.NADFUN_WMON || defaults.nadfunWmon,
    nadfunApiUrl: process.env.NADFUN_API_URL || defaults.nadfunApiUrl,
    erc8004IdentityAddress: process.env.ERC8004_IDENTITY_ADDRESS || defaults.erc8004IdentityAddress,
    erc8004ReputationAddress: process.env.ERC8004_REPUTATION_ADDRESS || defaults.erc8004ReputationAddress,
    x402FacilitatorUrl: process.env.X402_FACILITATOR_URL,
    x402PayTo: process.env.X402_PAY_TO || undefined,
    x402Network: process.env.X402_NETWORK || defaults.x402Network,
    moltbookApiKey: process.env.MOLTBOOK_API_KEY || undefined,
    moltbookApiUrl: process.env.MOLTBOOK_API_URL,
    moltbookDefaultSubmolt: process.env.MOLTBOOK_DEFAULT_SUBMOLT,
    agentPrivateKey: process.env.AGENT_PRIVATE_KEY || undefined,
    dataDir: process.env.DATA_DIR,
  };

  // Strip undefined values so Zod defaults work
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined),
  );

  return ConfigSchema.parse(cleaned);
}

/** Singleton config instance. Throws on invalid config. */
let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/**
 * Try loading config without throwing.
 * Returns { success: true, config } or { success: false, error }.
 */
export function tryLoadConfig():
  | { success: true; config: Config }
  | { success: false; error: string } {
  try {
    const cfg = loadConfig();
    return { success: true, config: cfg };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      return { success: false, error: `Config validation failed:\n${issues}` };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
