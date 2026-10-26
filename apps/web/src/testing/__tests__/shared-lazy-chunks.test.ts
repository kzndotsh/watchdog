import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SHARED_LAZY_LOADERS } from "@/testing/shared-lazy-chunks";

const SHARED = path.resolve(import.meta.dirname, "../../shared");
const LOADER = /export const (\w+)\s*=\s*memoizeImport\(/g;

/** Production source files under `src/shared/` (tests left out). */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("preloadSharedLazyChunks", () => {
  it("covers every memoizeImport loader under src/shared", () => {
    const loaders = sourceFiles(SHARED).flatMap((file) =>
      [...readFileSync(file, "utf-8").matchAll(LOADER)].map((m) => m[1])
    );
    expect(loaders.length).toBeGreaterThan(0);
    expect(Object.keys(SHARED_LAZY_LOADERS).sort()).toEqual(
      [...loaders].sort()
    );
  });
});
