import { describe, it, expect } from "vitest";
import {
  monadTestnet,
  getMonadClient,
  createMonadWalletClient,
  getExplorerTxUrl,
  getExplorerAddressUrl,
} from "../../src/blockchain/monad.js";

describe("Monad Chain Config", () => {
  it("has correct chain ID", () => {
    expect(monadTestnet.id).toBe(10143);
  });

  it("has correct name", () => {
    expect(monadTestnet.name).toBe("Monad Testnet");
  });

  it("has MON as native currency", () => {
    expect(monadTestnet.nativeCurrency.symbol).toBe("MON");
    expect(monadTestnet.nativeCurrency.decimals).toBe(18);
  });

  it("has correct RPC URL", () => {
    expect(monadTestnet.rpcUrls.default.http[0]).toBe(
      "https://testnet-rpc.monad.xyz",
    );
  });

  it("has block explorer configured", () => {
    expect(monadTestnet.blockExplorers?.default.url).toBe(
      "https://testnet.monadexplorer.com",
    );
  });

  it("is marked as testnet", () => {
    expect(monadTestnet.testnet).toBe(true);
  });
});

describe("getMonadClient", () => {
  it("returns a public client (singleton)", () => {
    const client1 = getMonadClient();
    const client2 = getMonadClient();

    expect(client1).toBeDefined();
    expect(client1).toBe(client2); // Singleton
  });
});

describe("createMonadWalletClient", () => {
  it("creates a wallet client from a private key", () => {
    const testKey =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
    const client = createMonadWalletClient(testKey);

    expect(client).toBeDefined();
    expect(client.account).toBeDefined();
    expect(client.account!.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("different keys produce different clients", () => {
    const key1 =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
    const key2 =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`;

    const c1 = createMonadWalletClient(key1);
    const c2 = createMonadWalletClient(key2);

    expect(c1.account!.address).not.toBe(c2.account!.address);
  });
});

describe("Explorer URLs", () => {
  it("generates correct transaction URL", () => {
    const url = getExplorerTxUrl("0xabc123" as `0x${string}`);
    expect(url).toBe("https://testnet.monadexplorer.com/tx/0xabc123");
  });

  it("generates correct address URL", () => {
    const url = getExplorerAddressUrl(
      "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
    );
    expect(url).toBe(
      "https://testnet.monadexplorer.com/address/0x1234567890abcdef1234567890abcdef12345678",
    );
  });
});
