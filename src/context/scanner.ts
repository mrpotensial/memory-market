import { readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from "fs";
import { join, relative, extname } from "path";
import type { FileChunk } from "./models.js";
import { detectLanguage } from "./models.js";

// === Configuration ===

const ALLOWED_EXTENSIONS = new Set([
  ".py",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".sol",
  ".rs",
  ".go",
  ".java",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".txt",
  ".cfg",
  ".ini",
  ".env.example",
]);

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  "egg-info",
]);

const SKIP_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".DS_Store",
  "Thumbs.db",
]);

/** Max lines per chunk */
const CHUNK_SIZE = 300;

/** Overlap between chunks for context continuity */
const CHUNK_OVERLAP = 50;

/** Max file size in bytes (skip files larger than 1MB) */
const MAX_FILE_SIZE = 1_000_000;

// === Scanner ===

export interface ScanOptions {
  /** Extensions to include (with dot). If empty, uses defaults. */
  extensions?: string[];
  /** Directories to skip. Merged with defaults. */
  skipDirs?: string[];
  /** Max lines per chunk */
  chunkSize?: number;
  /** Overlap lines between chunks */
  chunkOverlap?: number;
}

/**
 * Scan a directory for source code files and split them into chunks.
 * Windows-safe: uses path.join for all path operations.
 */
export function scanDirectory(
  rootDir: string,
  options: ScanOptions = {},
): FileChunk[] {
  const extensions = options.extensions
    ? new Set(options.extensions)
    : ALLOWED_EXTENSIONS;
  const skipDirs = new Set([
    ...SKIP_DIRS,
    ...(options.skipDirs ?? []),
  ]);
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? CHUNK_OVERLAP;

  const chunks: FileChunk[] = [];
  const files = collectFiles(rootDir, rootDir, extensions, skipDirs);

  for (const filePath of files) {
    const content = readFileSafe(filePath);
    if (content === null) continue;

    const relPath = relative(rootDir, filePath).replace(/\\/g, "/");
    const fileChunks = chunkContent(
      relPath,
      content,
      chunkSize,
      chunkOverlap,
    );
    chunks.push(...fileChunks);
  }

  return chunks;
}

/** Recursively collect file paths matching criteria */
function collectFiles(
  currentDir: string,
  rootDir: string,
  extensions: Set<string>,
  skipDirs: Set<string>,
): string[] {
  const files: string[] = [];

  let entries;
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) {
        files.push(...collectFiles(fullPath, rootDir, extensions, skipDirs));
      }
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;

      const ext = extname(entry.name).toLowerCase();
      if (!extensions.has(ext)) continue;

      try {
        const stat = statSync(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;
      } catch {
        continue;
      }

      // Skip binary files (check for null bytes)
      if (isBinaryFile(fullPath)) continue;

      files.push(fullPath);
    }
  }

  return files;
}

/** Read file content safely, handling encoding issues */
function readFileSafe(filePath: string): string | null {
  try {
    let content = readFileSync(filePath, "utf-8");
    // Strip UTF-8 BOM if present
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }
    return content;
  } catch {
    return null;
  }
}

/** Check if file appears to be binary by looking for null bytes */
function isBinaryFile(filePath: string): boolean {
  let fd: number | undefined;
  try {
    const buffer = Buffer.alloc(1024);
    fd = openSync(filePath, "r");
    const bytesRead = readSync(fd, buffer, 0, 1024, 0);
    closeSync(fd);
    fd = undefined;

    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true;
    }
    return false;
  } catch {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
    return false;
  }
}

/** Split file content into overlapping chunks */
function chunkContent(
  filePath: string,
  content: string,
  chunkSize: number,
  overlap: number,
): FileChunk[] {
  const lines = content.split("\n");
  const language = detectLanguage(filePath);

  // Small file: single chunk
  if (lines.length <= chunkSize) {
    return [
      {
        filePath,
        content,
        chunkIndex: 0,
        totalChunks: 1,
        lineStart: 1,
        lineEnd: lines.length,
        language,
      },
    ];
  }

  // Large file: split into overlapping chunks
  const chunks: FileChunk[] = [];
  const step = chunkSize - overlap;
  const totalChunks = Math.ceil((lines.length - overlap) / step);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * step;
    const end = Math.min(start + chunkSize, lines.length);
    const chunkLines = lines.slice(start, end);

    chunks.push({
      filePath,
      content: chunkLines.join("\n"),
      chunkIndex: i,
      totalChunks,
      lineStart: start + 1,
      lineEnd: end,
      language,
    });

    if (end >= lines.length) break;
  }

  return chunks;
}
