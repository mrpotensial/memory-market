import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { app } from "../../src/api/server.js";
import { MarketplaceRegistry } from "../../src/marketplace/registry.js";
import { join } from "path";
import { rmSync } from "fs";
import { homedir } from "os";

/**
 * API server tests using Hono's built-in test capabilities.
 * We call app.request() directly without starting a real server.
 */

describe("API Server", () => {
  describe("GET /api", () => {
    it("returns API info", async () => {
      const res = await app.request("/api");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.name).toBe("Memory Markets API");
      expect(body.version).toBe("0.1.0");
      expect(body.endpoints).toBeInstanceOf(Array);
    });
  });

  describe("GET /packages", () => {
    it("returns packages array", async () => {
      const res = await app.request("/packages");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.packages).toBeInstanceOf(Array);
      expect(typeof body.count).toBe("number");
    });
  });

  describe("GET /api/packages/:id", () => {
    it("returns 404 for nonexistent package", async () => {
      const res = await app.request("/api/packages/nonexistent_id_123");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe("Package not found");
    });
  });

  describe("POST /packages/search", () => {
    it("returns search results", async () => {
      const res = await app.request("/packages/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "typescript" }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.query).toBe("typescript");
      expect(body.results).toBeInstanceOf(Array);
      expect(typeof body.count).toBe("number");
    });

    it("respects limit parameter", async () => {
      const res = await app.request("/packages/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "test", limit: 2 }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results.length).toBeLessThanOrEqual(2);
    });
  });
});
