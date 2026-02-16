import { describe, it, expect } from "vitest";
import {
  EntitySchema,
  RelationshipSchema,
  FileChunkSchema,
  PackageMetadataSchema,
  ContextPackageSchema,
  detectLanguage,
} from "../../src/context/models.js";

describe("EntitySchema", () => {
  it("validates a correct entity", () => {
    const entity = EntitySchema.parse({
      name: "UserService",
      entityType: "class",
      description: "Handles user authentication and management",
      sourceFile: "src/services/user.ts",
      lineStart: 10,
      lineEnd: 50,
    });
    expect(entity.name).toBe("UserService");
    expect(entity.entityType).toBe("class");
  });

  it("rejects invalid entity type", () => {
    expect(() =>
      EntitySchema.parse({
        name: "foo",
        entityType: "invalid_type",
        description: "test",
        sourceFile: "test.ts",
      }),
    ).toThrow();
  });

  it("allows optional line numbers", () => {
    const entity = EntitySchema.parse({
      name: "foo",
      entityType: "function",
      description: "test",
      sourceFile: "test.ts",
    });
    expect(entity.lineStart).toBeUndefined();
    expect(entity.lineEnd).toBeUndefined();
  });
});

describe("RelationshipSchema", () => {
  it("validates a correct relationship", () => {
    const rel = RelationshipSchema.parse({
      source: "src/a.ts",
      target: "src/b.ts",
      relationType: "imports",
    });
    expect(rel.source).toBe("src/a.ts");
    expect(rel.relationType).toBe("imports");
  });
});

describe("FileChunkSchema", () => {
  it("validates a correct chunk", () => {
    const chunk = FileChunkSchema.parse({
      filePath: "src/main.ts",
      content: "export function main() {}",
      chunkIndex: 0,
      totalChunks: 1,
      lineStart: 1,
      lineEnd: 1,
    });
    expect(chunk.filePath).toBe("src/main.ts");
  });
});

describe("PackageMetadataSchema", () => {
  it("generates default ID and timestamp", () => {
    const meta = PackageMetadataSchema.parse({
      name: "test-package",
      sourceDir: "/test",
    });
    expect(meta.id).toMatch(/^ctx_/);
    expect(meta.createdAt).toBeTruthy();
    expect(meta.fileCount).toBe(0);
    expect(meta.tags).toEqual([]);
  });
});

describe("ContextPackageSchema", () => {
  it("creates a minimal valid package", () => {
    const pkg = ContextPackageSchema.parse({
      metadata: {
        name: "test",
        sourceDir: "/test",
      },
    });
    expect(pkg.entities).toEqual([]);
    expect(pkg.relationships).toEqual([]);
    expect(pkg.insights).toEqual([]);
    expect(pkg.summary).toBe("");
  });

  it("roundtrips through JSON", () => {
    const pkg = ContextPackageSchema.parse({
      metadata: { name: "test", sourceDir: "/test" },
      entities: [
        {
          name: "Foo",
          entityType: "class",
          description: "A test class",
          sourceFile: "foo.ts",
        },
      ],
      insights: ["This is a test insight"],
      summary: "Test summary",
    });

    const json = JSON.stringify(pkg);
    const restored = ContextPackageSchema.parse(JSON.parse(json));
    expect(restored.entities.length).toBe(1);
    expect(restored.entities[0].name).toBe("Foo");
    expect(restored.insights).toEqual(["This is a test insight"]);
  });
});

describe("detectLanguage", () => {
  it("detects common languages", () => {
    expect(detectLanguage("main.py")).toBe("python");
    expect(detectLanguage("app.ts")).toBe("typescript");
    expect(detectLanguage("index.js")).toBe("javascript");
    expect(detectLanguage("Contract.sol")).toBe("solidity");
    expect(detectLanguage("README.md")).toBe("markdown");
    expect(detectLanguage("config.json")).toBe("json");
  });

  it("returns undefined for unknown extensions", () => {
    expect(detectLanguage("file.xyz")).toBeUndefined();
    expect(detectLanguage("noext")).toBeUndefined();
  });
});
