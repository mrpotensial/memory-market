/**
 * Memory Markets - Where Agents Trade Intelligence
 *
 * A marketplace for AI agent knowledge running on Monad blockchain.
 * Agents can export learned context, package it, sell it as Nad.fun tokens,
 * and other agents can buy and import that knowledge.
 */

export { getConfig, tryLoadConfig } from "./config.js";
export type { Config } from "./config.js";

export {
  MarketplaceRegistry,
  MarketplaceSearch,
  type PackageListing,
  type SaleRecord,
  type SearchResult,
} from "./marketplace/index.js";
