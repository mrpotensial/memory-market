import type { Address, Hex } from "viem";
import { getMonadClient, createMonadWalletClient, waitForTransaction, getExplorerTxUrl } from "./monad.js";
import { getConfig } from "../config.js";
import IdentityABI from "./abi/IERC8004Identity.json" with { type: "json" };
import ReputationABI from "./abi/IERC8004Reputation.json" with { type: "json" };

// === Types ===

export interface AgentIdentity {
  agentId: bigint;
  owner: string;
  agentURI: string;
}

export interface OnChainReputation {
  agentId: bigint;
  feedbackCount: bigint;
  summaryValue: bigint;
  summaryValueDecimals: number;
}

export interface RegisterResult {
  agentId: bigint;
  txHash: string;
  explorerUrl: string;
}

export interface FeedbackResult {
  txHash: string;
  explorerUrl: string;
}

// === ERC-8004 Contract Addresses ===

function getIdentityAddress(): Address {
  const config = getConfig();
  return config.erc8004IdentityAddress as Address;
}

function getReputationAddress(): Address {
  const config = getConfig();
  return config.erc8004ReputationAddress as Address;
}

// === ERC-8004 Client ===

/**
 * Client for interacting with ERC-8004 (Trustless Agents) contracts on Monad testnet.
 *
 * Identity Registry: ERC-721 based agent registration.
 *   - register(agentURI) → mints agent NFT, returns agentId
 *   - balanceOf(owner) → check if agent is registered
 *   - tokenURI(agentId) → get agent metadata URI
 *
 * Reputation Registry: On-chain feedback & trust signals.
 *   - giveFeedback(agentId, value, ...) → submit reputation
 *   - getSummary(agentId, ...) → read aggregated reputation
 */
export class ERC8004Client {
  private privateKey: Hex | null;

  constructor(privateKey?: Hex) {
    this.privateKey = privateKey ?? null;
  }

  // === Contract Verification ===

  /**
   * Check if the ERC-8004 contracts are deployed on-chain.
   * Returns which contracts have bytecode.
   */
  async verifyContracts(): Promise<{ identity: boolean; reputation: boolean }> {
    try {
      const publicClient = getMonadClient();
      const [identityCode, reputationCode] = await Promise.all([
        publicClient.getCode({ address: getIdentityAddress() }),
        publicClient.getCode({ address: getReputationAddress() }),
      ]);
      return {
        identity: !!identityCode && identityCode !== "0x",
        reputation: !!reputationCode && reputationCode !== "0x",
      };
    } catch {
      return { identity: false, reputation: false };
    }
  }

  // === Identity Registry ===

  /**
   * Register a new agent identity on-chain.
   * Mints an ERC-721 NFT representing the agent.
   * @param agentURI - Metadata URI (e.g., JSON with name, description, capabilities)
   */
  async registerAgent(agentURI: string): Promise<RegisterResult> {
    if (!this.privateKey) {
      throw new Error("Private key required for registration");
    }

    // Verify contract is deployed before spending gas
    const contracts = await this.verifyContracts();
    if (!contracts.identity) {
      throw new Error(
        "ERC-8004 Identity contract not deployed at " + getIdentityAddress() +
        ". Contracts may not yet be deployed on this network."
      );
    }

    const walletClient = createMonadWalletClient(this.privateKey);

    const txHash = await walletClient.writeContract({
      chain: walletClient.chain,
      account: walletClient.account!,
      address: getIdentityAddress(),
      abi: IdentityABI,
      functionName: "register",
      args: [agentURI],
    });

    const receipt = await waitForTransaction(txHash);

    // Extract agentId from Registered event logs
    // Registered(uint256 indexed agentId, string agentURI, address indexed owner) → 3 topics
    // Skip Transfer(address indexed from, address indexed to, uint256 indexed tokenId) → 4 topics
    let agentId = 0n;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === getIdentityAddress().toLowerCase()) {
        if (log.topics.length === 3) {
          // Registered event: topic[0] = sig, topic[1] = agentId, topic[2] = owner
          agentId = BigInt(log.topics[1] ?? "0");
          break;
        } else if (log.topics.length === 4) {
          // Transfer event: topic[0] = sig, topic[1] = from, topic[2] = to, topic[3] = tokenId
          agentId = BigInt(log.topics[3] ?? "0");
        }
      }
    }

    return {
      agentId,
      txHash,
      explorerUrl: getExplorerTxUrl(txHash),
    };
  }

  /**
   * Check if an address has a registered agent identity.
   * Uses ERC-721 balanceOf — if > 0, the address owns at least one agent NFT.
   */
  async isRegistered(address: string): Promise<boolean> {
    try {
      const publicClient = getMonadClient();
      // Quick check: if no contract deployed, return false
      const code = await publicClient.getCode({ address: getIdentityAddress() });
      if (!code || code === "0x") return false;

      const balance = await publicClient.readContract({
        address: getIdentityAddress(),
        abi: IdentityABI,
        functionName: "balanceOf",
        args: [address as Address],
      }) as bigint;
      return balance > 0n;
    } catch {
      return false;
    }
  }

  /**
   * Get agent identity by tokenId.
   * Returns the owner and tokenURI.
   */
  async getIdentity(agentId: bigint): Promise<AgentIdentity | null> {
    try {
      const publicClient = getMonadClient();

      const [owner, agentURI] = await Promise.all([
        publicClient.readContract({
          address: getIdentityAddress(),
          abi: IdentityABI,
          functionName: "ownerOf",
          args: [agentId],
        }) as Promise<string>,
        publicClient.readContract({
          address: getIdentityAddress(),
          abi: IdentityABI,
          functionName: "tokenURI",
          args: [agentId],
        }) as Promise<string>,
      ]);

      return { agentId, owner, agentURI };
    } catch {
      return null;
    }
  }

  /**
   * Get the agent wallet address associated with an agentId.
   */
  async getAgentWallet(agentId: bigint): Promise<string | null> {
    try {
      const publicClient = getMonadClient();
      const wallet = await publicClient.readContract({
        address: getIdentityAddress(),
        abi: IdentityABI,
        functionName: "getAgentWallet",
        args: [agentId],
      }) as string;
      return wallet;
    } catch {
      return null;
    }
  }

  /**
   * Set metadata for an agent identity.
   */
  async setMetadata(agentId: bigint, key: string, value: Uint8Array): Promise<FeedbackResult> {
    if (!this.privateKey) {
      throw new Error("Private key required for setting metadata");
    }

    const walletClient = createMonadWalletClient(this.privateKey);

    const txHash = await walletClient.writeContract({
      chain: walletClient.chain,
      account: walletClient.account!,
      address: getIdentityAddress(),
      abi: IdentityABI,
      functionName: "setMetadata",
      args: [agentId, key, `0x${Buffer.from(value).toString("hex")}` as Hex],
    });

    await waitForTransaction(txHash);

    return {
      txHash,
      explorerUrl: getExplorerTxUrl(txHash),
    };
  }

  /**
   * Get metadata value for an agent identity.
   */
  async getMetadata(agentId: bigint, key: string): Promise<string | null> {
    try {
      const publicClient = getMonadClient();
      const value = await publicClient.readContract({
        address: getIdentityAddress(),
        abi: IdentityABI,
        functionName: "getMetadata",
        args: [agentId, key],
      }) as Hex;
      return value;
    } catch {
      return null;
    }
  }

  // === Reputation Registry ===

  /**
   * Submit reputation feedback for an agent.
   *
   * @param agentId - The agent's ERC-721 tokenId
   * @param value - Feedback score (int128, e.g., 5 = positive, -5 = negative)
   * @param tag1 - Primary category tag (e.g., "knowledge-quality")
   * @param tag2 - Secondary tag (e.g., "memory-markets")
   * @param endpoint - Optional service endpoint URL
   */
  async giveFeedback(
    agentId: bigint,
    value: number,
    tag1: string = "knowledge-quality",
    tag2: string = "memory-markets",
    endpoint: string = "",
  ): Promise<FeedbackResult> {
    if (!this.privateKey) {
      throw new Error("Private key required for giving feedback");
    }

    // Verify contract is deployed before spending gas
    const contracts = await this.verifyContracts();
    if (!contracts.reputation) {
      throw new Error(
        "ERC-8004 Reputation contract not deployed at " + getReputationAddress() +
        ". Contracts may not yet be deployed on this network."
      );
    }

    const walletClient = createMonadWalletClient(this.privateKey);

    // Convert value to int128 (no decimals for simplicity)
    const valueInt128 = BigInt(value);
    const valueDecimals = 0;

    // Empty feedbackURI and zero hash (on-chain only feedback)
    const feedbackURI = "";
    const feedbackHash = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

    const txHash = await walletClient.writeContract({
      chain: walletClient.chain,
      account: walletClient.account!,
      address: getReputationAddress(),
      abi: ReputationABI,
      functionName: "giveFeedback",
      args: [agentId, valueInt128, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash],
    });

    await waitForTransaction(txHash);

    return {
      txHash,
      explorerUrl: getExplorerTxUrl(txHash),
    };
  }

  /**
   * Get aggregated reputation summary for an agent.
   * Returns total feedback count and aggregated score.
   */
  async getReputationSummary(
    agentId: bigint,
    tag1: string = "",
    tag2: string = "",
  ): Promise<OnChainReputation | null> {
    try {
      const publicClient = getMonadClient();

      const result = await publicClient.readContract({
        address: getReputationAddress(),
        abi: ReputationABI,
        functionName: "getSummary",
        args: [agentId, [] as Address[], tag1, tag2],
      }) as [bigint, bigint, number];

      const [count, summaryValue, summaryValueDecimals] = result;

      return {
        agentId,
        feedbackCount: count,
        summaryValue,
        summaryValueDecimals,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all client addresses that have given feedback to an agent.
   */
  async getClients(agentId: bigint): Promise<string[]> {
    try {
      const publicClient = getMonadClient();
      const clients = await publicClient.readContract({
        address: getReputationAddress(),
        abi: ReputationABI,
        functionName: "getClients",
        args: [agentId],
      }) as string[];
      return clients;
    } catch {
      return [];
    }
  }

  /**
   * Get the Identity Registry address linked to the Reputation Registry.
   */
  async getLinkedIdentityRegistry(): Promise<string | null> {
    try {
      const publicClient = getMonadClient();
      const addr = await publicClient.readContract({
        address: getReputationAddress(),
        abi: ReputationABI,
        functionName: "getIdentityRegistry",
      }) as string;
      return addr;
    } catch {
      return null;
    }
  }
}

// === Helper ===

/** Build an agent metadata URI as a data: URL with JSON content */
export function buildAgentURI(name: string, description: string, capabilities: string[]): string {
  const metadata = {
    name,
    description,
    capabilities,
    platform: "memory-markets",
    version: "0.1.0",
    chain: "monad-testnet",
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;
}
