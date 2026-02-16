import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MarketplaceRegistry, type PackageListing } from "../../src/marketplace/registry.js";
import { join } from "path";
import { rmSync } from "fs";

describe("MarketplaceRegistry", () => {
  const testDbPath = join(import.meta.dirname, "__test_registry__.db");
  let registry: MarketplaceRegistry;

  beforeEach(async () => {
    rmSync(testDbPath, { force: true });
    registry = new MarketplaceRegistry(testDbPath);
    await registry.init();
  });

  afterEach(() => {
    registry.close();
    rmSync(testDbPath, { force: true });
  });

  const sampleListing: Omit<PackageListing, "timesSold" | "createdAt"> = {
    id: "ctx_abc123",
    name: "Test Knowledge",
    description: "A test knowledge package about TypeScript",
    tags: "typescript,testing",
    priceMon: 1.5,
    tokenAddress: null,
    curveAddress: null,
    creatorAddress: "0x1234567890abcdef1234567890abcdef12345678",
    packagePath: "/path/to/test.mmctx",
    fileCount: 10,
    chunkCount: 25,
    entityCount: 15,
  };

  it("starts with empty database", () => {
    expect(registry.getPackageCount()).toBe(0);
    expect(registry.getAllPackages()).toEqual([]);
  });

  it("lists and retrieves a package", () => {
    registry.listPackage(sampleListing);

    expect(registry.getPackageCount()).toBe(1);

    const pkg = registry.getPackage("ctx_abc123");
    expect(pkg).not.toBeNull();
    expect(pkg!.name).toBe("Test Knowledge");
    expect(pkg!.description).toBe("A test knowledge package about TypeScript");
    expect(pkg!.tags).toBe("typescript,testing");
    expect(pkg!.priceMon).toBe(1.5);
    expect(pkg!.fileCount).toBe(10);
    expect(pkg!.timesSold).toBe(0);
  });

  it("returns null for nonexistent package", () => {
    expect(registry.getPackage("nonexistent")).toBeNull();
  });

  it("lists multiple packages", () => {
    registry.listPackage(sampleListing);
    registry.listPackage({
      ...sampleListing,
      id: "ctx_def456",
      name: "Second Package",
    });

    const all = registry.getAllPackages();
    expect(all.length).toBe(2);
  });

  it("upserts on duplicate ID", () => {
    registry.listPackage(sampleListing);
    registry.listPackage({
      ...sampleListing,
      name: "Updated Name",
    });

    expect(registry.getPackageCount()).toBe(1);
    const pkg = registry.getPackage("ctx_abc123");
    expect(pkg!.name).toBe("Updated Name");
  });

  it("searches by keyword in name", () => {
    registry.listPackage(sampleListing);
    registry.listPackage({
      ...sampleListing,
      id: "ctx_other",
      name: "Python Guide",
      description: "A guide about Python",
      tags: "python",
    });

    const results = registry.searchByKeyword("TypeScript");
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Test Knowledge");
  });

  it("searches by keyword in description", () => {
    registry.listPackage(sampleListing);

    const results = registry.searchByKeyword("TypeScript");
    expect(results.length).toBe(1);
  });

  it("searches by keyword in tags", () => {
    registry.listPackage(sampleListing);

    const results = registry.searchByKeyword("testing");
    expect(results.length).toBe(1);
  });

  it("records sales and increments counter", () => {
    registry.listPackage(sampleListing);

    registry.recordSale(
      "ctx_abc123",
      "0xbuyer1234",
      1.5,
      "0xtxhash1",
    );

    const pkg = registry.getPackage("ctx_abc123");
    expect(pkg!.timesSold).toBe(1);

    registry.recordSale(
      "ctx_abc123",
      "0xbuyer5678",
      1.5,
      "0xtxhash2",
    );

    const pkg2 = registry.getPackage("ctx_abc123");
    expect(pkg2!.timesSold).toBe(2);
  });

  it("retrieves sale history", () => {
    registry.listPackage(sampleListing);
    registry.recordSale("ctx_abc123", "0xbuyer1234", 1.5, "0xtxhash1");
    registry.recordSale("ctx_abc123", "0xbuyer5678", 1.5, "0xtxhash2");

    const sales = registry.getSales("ctx_abc123");
    expect(sales.length).toBe(2);
    expect(sales[0].buyerAddress).toBe("0xbuyer5678"); // Most recent (higher ID)
    expect(sales[1].buyerAddress).toBe("0xbuyer1234");
  });

  it("updates token info", () => {
    registry.listPackage(sampleListing);

    registry.updateTokenInfo(
      "ctx_abc123",
      "0xtoken1234",
      "0xcurve5678",
    );

    const pkg = registry.getPackage("ctx_abc123");
    expect(pkg!.tokenAddress).toBe("0xtoken1234");
    expect(pkg!.curveAddress).toBe("0xcurve5678");
  });

  it("deletes a package", () => {
    registry.listPackage(sampleListing);
    expect(registry.deletePackage("ctx_abc123")).toBe(true);
    expect(registry.getPackageCount()).toBe(0);
  });

  it("returns false when deleting nonexistent package", () => {
    expect(registry.deletePackage("nonexistent")).toBe(false);
  });

  it("persists data across instances", async () => {
    registry.listPackage(sampleListing);
    registry.close();

    // Reopen
    const registry2 = new MarketplaceRegistry(testDbPath);
    await registry2.init();

    expect(registry2.getPackageCount()).toBe(1);
    const pkg = registry2.getPackage("ctx_abc123");
    expect(pkg!.name).toBe("Test Knowledge");

    registry2.close();
  });
});
