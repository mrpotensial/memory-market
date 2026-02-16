import {
  parseEther,
  type Address,
  type Hex,
  maxUint256,
  keccak256,
  toHex,
} from "viem";
import { getMonadClient, createMonadWalletClient, getActiveChain, isMainnet, waitForTransaction, getExplorerTxUrl } from "./monad.js";
import { getConfig } from "../config.js";

// === ABIs ===
// Testnet: ICore (v0.3.0)
import ICoreAbi from "./abi/ICore.json" with { type: "json" };
// Mainnet: IBondingCurveRouter (v3)
import IBondingCurveRouterAbi from "./abi/IBondingCurveRouter.json" with { type: "json" };
import ITokenAbi from "./abi/IToken.json" with { type: "json" };

// === Contract Addresses (from config) ===

function getContracts() {
  const cfg = getConfig();
  return {
    CORE: cfg.nadfunCoreAddress as Address,
    BONDING_CURVE_FACTORY: cfg.nadfunBondingCurveFactory as Address,
    UNISWAP_V2_ROUTER: cfg.nadfunUniswapRouter as Address,
    UNISWAP_V2_FACTORY: cfg.nadfunUniswapFactory as Address,
    WMON: cfg.nadfunWmon as Address,
  };
}

// Re-export for backward compatibility
export const CONTRACTS = {
  get CORE() { return getContracts().CORE; },
  get BONDING_CURVE_FACTORY() { return getContracts().BONDING_CURVE_FACTORY; },
  get UNISWAP_V2_ROUTER() { return getContracts().UNISWAP_V2_ROUTER; },
  get UNISWAP_V2_FACTORY() { return getContracts().UNISWAP_V2_FACTORY; },
  get WMON() { return getContracts().WMON; },
};

/** Deploy fee for creating a new token (10 MON) */
const CREATE_FEE_MON = 10n;

/** Trading fee rate: 1% = 10/1000 (testnet only — mainnet router handles fees) */
const FEE_NUMERATOR = 10n;
const FEE_DENOMINATOR = 1000n;

/** Default transaction deadline: 20 minutes */
const DEADLINE_SECONDS = 20 * 60;

// === Types ===

export interface CreateTokenResult {
  tokenAddress: Address;
  curveAddress: Address;
  txHash: Hex;
  explorerUrl: string;
}

export interface BuyTokenResult {
  txHash: Hex;
  explorerUrl: string;
}

export interface SellTokenResult {
  txHash: Hex;
  explorerUrl: string;
}

export interface TokenInfo {
  name: string;
  symbol: string;
  totalSupply: bigint;
  balance: bigint;
}

// === Nad.fun Client ===

/**
 * Client for interacting with Nad.fun contracts.
 * Supports both testnet (ICore v0.3.0) and mainnet (IBondingCurveRouter v3).
 */
export class NadFunClient {
  private privateKey: Hex;

  constructor(privateKey: Hex) {
    this.privateKey = privateKey;
  }

  /** Get the wallet address */
  getAddress(): Address {
    const walletClient = createMonadWalletClient(this.privateKey);
    return walletClient.account!.address;
  }

  async createToken(
    name: string,
    symbol: string,
    tokenURI: string = "",
    initialBuyMon: string = "0",
  ): Promise<CreateTokenResult> {
    if (isMainnet()) {
      return this._createTokenMainnet(name, symbol, tokenURI, initialBuyMon);
    }
    return this._createTokenTestnet(name, symbol, tokenURI, initialBuyMon);
  }

  async buyToken(
    tokenAddress: Address,
    amountMon: string,
  ): Promise<BuyTokenResult> {
    if (isMainnet()) {
      return this._buyTokenMainnet(tokenAddress, amountMon);
    }
    return this._buyTokenTestnet(tokenAddress, amountMon);
  }

  async sellToken(
    tokenAddress: Address,
    amountTokens: bigint,
  ): Promise<SellTokenResult> {
    if (isMainnet()) {
      return this._sellTokenMainnet(tokenAddress, amountTokens);
    }
    return this._sellTokenTestnet(tokenAddress, amountTokens);
  }

  // === Mainnet implementations (IBondingCurveRouter v3) ===

  private async _createTokenMainnet(
    name: string, symbol: string, tokenURI: string, initialBuyMon: string,
  ): Promise<CreateTokenResult> {
    const contracts = getContracts();
    const walletClient = createMonadWalletClient(this.privateKey);
    const chain = getActiveChain();
    const salt = keccak256(toHex(Date.now().toString() + Math.random().toString()));
    const amountOut = parseEther(initialBuyMon);
    const createFee = parseEther(CREATE_FEE_MON.toString());
    const totalValue = amountOut + createFee;

    const txHash = await walletClient.writeContract({
      chain, account: walletClient.account!,
      address: contracts.CORE, abi: IBondingCurveRouterAbi,
      functionName: "create" as const,
      args: [{ name, symbol, tokenURI, amountOut, salt, actionId: 0 }],
      value: totalValue,
    });

    const receipt = await waitForTransaction(txHash);
    const { tokenAddress, curveAddress } = this._extractAddressesFromLogs(receipt, contracts, walletClient.account!.address);

    if (tokenAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error(`Token creation tx succeeded (${txHash}) but could not extract addresses. Check: ${getExplorerTxUrl(txHash)}`);
    }

    return { tokenAddress, curveAddress, txHash, explorerUrl: getExplorerTxUrl(txHash) };
  }

  private async _buyTokenMainnet(tokenAddress: Address, amountMon: string): Promise<BuyTokenResult> {
    const contracts = getContracts();
    const walletClient = createMonadWalletClient(this.privateKey);
    const chain = getActiveChain();
    const amountIn = parseEther(amountMon);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

    const txHash = await walletClient.writeContract({
      chain, account: walletClient.account!,
      address: contracts.CORE, abi: IBondingCurveRouterAbi,
      functionName: "buy" as const,
      args: [{ amountOutMin: 0n, token: tokenAddress, to: walletClient.account!.address, deadline }],
      value: amountIn,
    });

    await waitForTransaction(txHash);
    return { txHash, explorerUrl: getExplorerTxUrl(txHash) };
  }

  private async _sellTokenMainnet(tokenAddress: Address, amountTokens: bigint): Promise<SellTokenResult> {
    const contracts = getContracts();
    const walletClient = createMonadWalletClient(this.privateKey);
    const chain = getActiveChain();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

    await this._ensureAllowance(tokenAddress, contracts.CORE, amountTokens);

    const txHash = await walletClient.writeContract({
      chain, account: walletClient.account!,
      address: contracts.CORE, abi: IBondingCurveRouterAbi,
      functionName: "sell" as const,
      args: [{ amountIn: amountTokens, amountOutMin: 0n, token: tokenAddress, to: walletClient.account!.address, deadline }],
    });

    await waitForTransaction(txHash);
    return { txHash, explorerUrl: getExplorerTxUrl(txHash) };
  }

  // === Testnet implementations (ICore v0.3.0) ===

  private async _createTokenTestnet(
    name: string, symbol: string, tokenURI: string, initialBuyMon: string,
  ): Promise<CreateTokenResult> {
    const contracts = getContracts();
    const walletClient = createMonadWalletClient(this.privateKey);
    const address = walletClient.account!.address;
    const chain = getActiveChain();

    const amountIn = parseEther(initialBuyMon);
    const fee = (amountIn * FEE_NUMERATOR) / FEE_DENOMINATOR;
    const createFee = parseEther(CREATE_FEE_MON.toString());
    const totalValue = amountIn + fee + createFee;

    const txHash = await walletClient.writeContract({
      chain, account: walletClient.account!,
      address: contracts.CORE, abi: ICoreAbi,
      functionName: "createCurve" as const,
      args: [address, name, symbol, tokenURI, amountIn, fee],
      value: totalValue,
    });

    const receipt = await waitForTransaction(txHash);
    let { tokenAddress, curveAddress } = this._extractAddressesFromLogs(receipt, contracts, address);

    // Fallback: try debug_traceTransaction
    if (tokenAddress === "0x0000000000000000000000000000000000000000") {
      try {
        const publicClient = getMonadClient();
        const trace: any = await publicClient.request({
          method: "debug_traceTransaction" as any,
          params: [txHash, { tracer: "callTracer" }] as any,
        });
        const findCreates = (call: any): Address[] => {
          const addrs: Address[] = [];
          if (call.type === "CREATE" || call.type === "CREATE2") {
            if (call.to) addrs.push(call.to as Address);
          }
          if (call.calls) {
            for (const sub of call.calls) addrs.push(...findCreates(sub));
          }
          return addrs;
        };
        const created = findCreates(trace);
        if (created.length >= 1) tokenAddress = created[0];
        if (created.length >= 2) curveAddress = created[1];
      } catch {
        // Trace API not available
      }
    }

    if (tokenAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error(`Token creation tx succeeded (${txHash}) but could not extract addresses. Check: ${getExplorerTxUrl(txHash)}`);
    }

    return { tokenAddress, curveAddress, txHash, explorerUrl: getExplorerTxUrl(txHash) };
  }

  private async _buyTokenTestnet(tokenAddress: Address, amountMon: string): Promise<BuyTokenResult> {
    const contracts = getContracts();
    const walletClient = createMonadWalletClient(this.privateKey);
    const address = walletClient.account!.address;
    const chain = getActiveChain();

    const amountIn = parseEther(amountMon);
    const fee = (amountIn * FEE_NUMERATOR) / FEE_DENOMINATOR;
    const totalValue = amountIn + fee;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

    const txHash = await walletClient.writeContract({
      chain, account: walletClient.account!,
      address: contracts.CORE, abi: ICoreAbi,
      functionName: "buy" as const,
      args: [amountIn, fee, tokenAddress, address, deadline],
      value: totalValue,
    });

    await waitForTransaction(txHash);
    return { txHash, explorerUrl: getExplorerTxUrl(txHash) };
  }

  private async _sellTokenTestnet(tokenAddress: Address, amountTokens: bigint): Promise<SellTokenResult> {
    const contracts = getContracts();
    const walletClient = createMonadWalletClient(this.privateKey);
    const chain = getActiveChain();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

    await this._ensureAllowance(tokenAddress, contracts.CORE, amountTokens);

    const txHash = await walletClient.writeContract({
      chain, account: walletClient.account!,
      address: contracts.CORE, abi: ICoreAbi,
      functionName: "sell" as const,
      args: [amountTokens, tokenAddress, walletClient.account!.address, deadline],
    });

    await waitForTransaction(txHash);
    return { txHash, explorerUrl: getExplorerTxUrl(txHash) };
  }

  // === Shared helpers ===

  private _extractAddressesFromLogs(
    receipt: any,
    contracts: ReturnType<typeof getContracts>,
    walletAddress: Address,
  ): { tokenAddress: Address; curveAddress: Address } {
    let tokenAddress: Address = "0x0000000000000000000000000000000000000000";
    let curveAddress: Address = "0x0000000000000000000000000000000000000000";

    if (receipt.logs?.length > 0) {
      const knownAddresses = new Set([
        contracts.CORE.toLowerCase(),
        contracts.BONDING_CURVE_FACTORY.toLowerCase(),
        contracts.WMON.toLowerCase(),
        walletAddress.toLowerCase(),
      ]);
      const newAddresses: Address[] = [];
      for (const log of receipt.logs) {
        const logAddr = log.address.toLowerCase();
        if (!knownAddresses.has(logAddr) && !newAddresses.includes(log.address as Address)) {
          newAddresses.push(log.address as Address);
        }
      }
      if (newAddresses.length >= 1) tokenAddress = newAddresses[0];
      if (newAddresses.length >= 2) curveAddress = newAddresses[1];
    }

    return { tokenAddress, curveAddress };
  }

  private async _ensureAllowance(tokenAddress: Address, spender: Address, amount: bigint): Promise<void> {
    const publicClient = getMonadClient();
    const walletClient = createMonadWalletClient(this.privateKey);
    const address = walletClient.account!.address;
    const chain = getActiveChain();

    const currentAllowance = await publicClient.readContract({
      address: tokenAddress,
      abi: ITokenAbi,
      functionName: "allowance",
      args: [address, spender],
    }) as bigint;

    if (currentAllowance < amount) {
      const approveTx = await walletClient.writeContract({
        chain, account: walletClient.account!,
        address: tokenAddress, abi: ITokenAbi,
        functionName: "approve" as const,
        args: [spender, maxUint256],
      });
      await waitForTransaction(approveTx);
    }
  }

  /** Get token info: name, symbol, balance */
  async getTokenInfo(tokenAddress: Address): Promise<TokenInfo> {
    const publicClient = getMonadClient();
    const address = this.getAddress();

    const [name, symbol, totalSupply, balance] = await Promise.all([
      publicClient.readContract({ address: tokenAddress, abi: ITokenAbi, functionName: "name" }) as Promise<string>,
      publicClient.readContract({ address: tokenAddress, abi: ITokenAbi, functionName: "symbol" }) as Promise<string>,
      publicClient.readContract({ address: tokenAddress, abi: ITokenAbi, functionName: "totalSupply" }) as Promise<bigint>,
      publicClient.readContract({ address: tokenAddress, abi: ITokenAbi, functionName: "balanceOf", args: [address] }) as Promise<bigint>,
    ]);

    return { name, symbol, totalSupply, balance };
  }

  /** Get token balance for the wallet */
  async getTokenBalance(tokenAddress: Address): Promise<bigint> {
    const publicClient = getMonadClient();
    const address = this.getAddress();
    return publicClient.readContract({
      address: tokenAddress, abi: ITokenAbi,
      functionName: "balanceOf", args: [address],
    }) as Promise<bigint>;
  }
}

// === Nad.fun API Client (for reading data) ===

function getNadfunApiUrl(): string {
  return getConfig().nadfunApiUrl;
}

/** Fetch token metadata from Nad.fun API */
export async function fetchTokenFromAPI(tokenAddress: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${getNadfunApiUrl()}/token/${tokenAddress}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Fetch latest tokens from Nad.fun API */
export async function fetchLatestTokens(page: number = 1, limit: number = 10): Promise<unknown[]> {
  try {
    const res = await fetch(`${getNadfunApiUrl()}/order/creation_time?page=${page}&limit=${limit}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
