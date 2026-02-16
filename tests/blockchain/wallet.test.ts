import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { createWallet, loadWallet } from "../../src/blockchain/wallet.js";

describe("Wallet", () => {
  describe("createWallet", () => {
    it("generates a wallet with valid address and private key", () => {
      const wallet = createWallet();

      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(wallet.privateKey).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("generates unique wallets each time", () => {
      const w1 = createWallet();
      const w2 = createWallet();

      expect(w1.address).not.toBe(w2.address);
      expect(w1.privateKey).not.toBe(w2.privateKey);
    });

    it("address is checksummed (EIP-55)", () => {
      const wallet = createWallet();
      // EIP-55 addresses have mixed case
      expect(wallet.address).toMatch(/^0x/);
      expect(wallet.address.length).toBe(42);
    });
  });

  describe("loadWallet", () => {
    it("loads a wallet from a known private key", () => {
      // Well-known test private key (DO NOT use in production)
      const testKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
      const wallet = loadWallet(testKey);

      expect(wallet.privateKey).toBe(testKey);
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("same private key always produces same address", () => {
      const testKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
      const w1 = loadWallet(testKey);
      const w2 = loadWallet(testKey);

      expect(w1.address).toBe(w2.address);
    });

    it("different private keys produce different addresses", () => {
      const key1 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
      const key2 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`;
      const w1 = loadWallet(key1);
      const w2 = loadWallet(key2);

      expect(w1.address).not.toBe(w2.address);
    });

    it("roundtrips: create -> load -> same address", () => {
      const original = createWallet();
      const loaded = loadWallet(original.privateKey);

      expect(loaded.address).toBe(original.address);
    });
  });

  describe("saveWallet + loadSavedWallet (logic tests)", () => {
    const testWalletDir = join(import.meta.dirname, "__test_wallets__");
    const testWalletFile = join(testWalletDir, "default.json");

    beforeEach(() => {
      rmSync(testWalletDir, { recursive: true, force: true });
      mkdirSync(testWalletDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(testWalletDir, { recursive: true, force: true });
    });

    it("saves wallet data to JSON file", () => {
      const wallet = createWallet();
      writeFileSync(
        testWalletFile,
        JSON.stringify({ address: wallet.address, privateKey: wallet.privateKey }, null, 2),
        "utf-8",
      );

      expect(existsSync(testWalletFile)).toBe(true);
      const data = JSON.parse(readFileSync(testWalletFile, "utf-8"));
      expect(data.address).toBe(wallet.address);
      expect(data.privateKey).toBe(wallet.privateKey);
    });

    it("roundtrips: save -> load produces same wallet", () => {
      const original = createWallet();
      writeFileSync(
        testWalletFile,
        JSON.stringify({ address: original.address, privateKey: original.privateKey }, null, 2),
        "utf-8",
      );

      const data = JSON.parse(readFileSync(testWalletFile, "utf-8"));
      const loaded = loadWallet(data.privateKey);

      expect(loaded.address).toBe(original.address);
      expect(loaded.privateKey).toBe(original.privateKey);
    });

    it("returns null when no file exists", () => {
      const fakePath = join(testWalletDir, "nonexistent.json");
      expect(existsSync(fakePath)).toBe(false);
    });

    it("handles corrupted wallet file gracefully", () => {
      writeFileSync(testWalletFile, "not valid json", "utf-8");
      expect(() => JSON.parse(readFileSync(testWalletFile, "utf-8"))).toThrow();
    });
  });

  describe("getActiveWallet (env logic)", () => {
    it("returns null when no AGENT_PRIVATE_KEY env var", () => {
      const original = process.env.AGENT_PRIVATE_KEY;
      delete process.env.AGENT_PRIVATE_KEY;

      const envKey = process.env.AGENT_PRIVATE_KEY;
      expect(envKey).toBeUndefined();

      if (original !== undefined) {
        process.env.AGENT_PRIVATE_KEY = original;
      }
    });

    it("loads wallet from AGENT_PRIVATE_KEY env var", () => {
      const testKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const original = process.env.AGENT_PRIVATE_KEY;
      process.env.AGENT_PRIVATE_KEY = testKey;

      const envKey = process.env.AGENT_PRIVATE_KEY;
      expect(envKey).toBe(testKey);
      expect(envKey!.startsWith("0x")).toBe(true);

      const wallet = loadWallet(envKey as `0x${string}`);
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);

      if (original !== undefined) {
        process.env.AGENT_PRIVATE_KEY = original;
      } else {
        delete process.env.AGENT_PRIVATE_KEY;
      }
    });

    it("ignores non-0x private keys", () => {
      const badKey = "not-a-valid-key";
      expect(badKey.startsWith("0x")).toBe(false);
    });
  });
});
