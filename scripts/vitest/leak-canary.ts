import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, vi } from "vitest";

import {
  diffSnapshots,
  dotenvKeysOf,
  leakMessage,
  takeSnapshot,
} from "./leak-canary-core";

// Setup file for the shared-worker (`isolate: false`) projects, listed last so the snapshot
// includes what the other setup files install. It runs before the test file is imported, so
// module-scope `Object.defineProperty` is compared too. Core logic and its fixture:
// `leak-canary-core.ts`, `scripts/__tests__/leak-canary.gate.test.ts`.
const before = takeSnapshot(() => vi.isFakeTimers());

const repoDotenvKeys = (): Set<string> => {
  try {
    return dotenvKeysOf(
      readFileSync(path.join(import.meta.dirname, "../../.env"), "utf-8")
    );
  } catch {
    return new Set();
  }
};

afterAll(() => {
  // `unstubGlobals` / `unstubEnvs` undo stubs before the next test, so the last test's
  // stubs would still be live here (and for the next file's import-time code). Undo them
  // now: stubs are not leaks, a direct assignment is.
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  const leaks = diffSnapshots(
    before,
    takeSnapshot(() => vi.isFakeTimers()),
    repoDotenvKeys()
  );
  if (leaks.length > 0) {
    throw new Error(leakMessage(leaks));
  }
});
