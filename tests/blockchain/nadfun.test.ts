import { describe, it, expect } from "vitest";
import { CONTRACTS, NadFunClient } from "../../src/blockchain/nadfun.js";
import { isMainnet } from "../../src/blockchain/monad.js";

const TESTNET_ADDRESSES = {
  CORE: "0x822EB1ADD41cf87C3F178100596cf24c9a6442f6",
  BONDING_CURVE_FACTORY: "0x60216FB3285595F4643f9f7cddAB842E799BD642",
  UNISWAP_V2_ROUTER: "0x619d07287e87C9c643C60882cA80d23C8ed44652",
  WMON: "0x3bb9AFB94c82752E47706A10779EA525Cf95dc27",
};

const MAINNET_ADDRESSES = {
  CORE: "0x6F6B8F1a20703309951a5127c45B49b1CD981A22",
  BONDING_CURVE_FACTORY: "0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE",
  UNISWAP_V2_ROUTER: "0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137",
  WMON: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
};

describe("Nad.fun Contract Addresses", () => {
  const expected = isMainnet() ? MAINNET_ADDRESSES : TESTNET_ADDRESSES;

  it("has correct Core address", () => {
    expect(CONTRACTS.CORE).toBe(expected.CORE);
  });

  it("has correct Bonding Curve Factory address", () => {
    expect(CONTRACTS.BONDING_CURVE_FACTORY).toBe(expected.BONDING_CURVE_FACTORY);
  });

  it("has correct Uniswap V2 Router address", () => {
    expect(CONTRACTS.UNISWAP_V2_ROUTER).toBe(expected.UNISWAP_V2_ROUTER);
  });

  it("has correct WMON address", () => {
    expect(CONTRACTS.WMON).toBe(expected.WMON);
  });

  it("all addresses are valid hex format", () => {
    for (const [name, addr] of Object.entries(CONTRACTS)) {
      expect(addr, `${name} should be valid address`).toMatch(
        /^0x[a-fA-F0-9]{40}$/,
      );
    }
  });
});

describe("NadFunClient", () => {
  const testKey =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

  it("instantiates with a private key", () => {
    const client = new NadFunClient(testKey);
    expect(client).toBeDefined();
  });

  it("returns a valid wallet address", () => {
    const client = new NadFunClient(testKey);
    const address = client.getAddress();

    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("same key always returns same address", () => {
    const c1 = new NadFunClient(testKey);
    const c2 = new NadFunClient(testKey);

    expect(c1.getAddress()).toBe(c2.getAddress());
  });
});

describe("Nad.fun API endpoints", () => {
  it("fetchTokenFromAPI handles invalid address gracefully", async () => {
    const { fetchTokenFromAPI } = await import("../../src/blockchain/nadfun.js");
    const result = await fetchTokenFromAPI("0x0000000000000000000000000000000000000000");

    // Should return null or an object (depending on API state), not throw
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("fetchLatestTokens returns an array", async () => {
    const { fetchLatestTokens } = await import("../../src/blockchain/nadfun.js");
    const result = await fetchLatestTokens(1, 5);

    expect(Array.isArray(result)).toBe(true);
  });
});
