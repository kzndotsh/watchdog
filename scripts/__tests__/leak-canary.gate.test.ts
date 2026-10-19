/**
 * Proves the shared-worker leak canary (`scripts/vitest/leak-canary.ts`) fails a file that leaves a
 * global changed and passes a file that cleans up. A throwaway Vitest project (`isolate:
 * false`, happy-dom, the real canary as its setup file) runs one deliberately leaking file
 * per leak kind next to a clean one; the run must fail, name each leaker and spare the
 * clean file. The real `vitest.config.ts` wiring is asserted separately.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import config from "../../vitest.config.ts";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const CANARY_FILES = [
  "scripts/vitest/leak-canary.ts",
  "scripts/vitest/leak-canary-core.ts",
];
const RUN_TIMEOUT_MS = 120_000;

const header = 'import { it, vi } from "vitest";\n';

/** A file per leak kind: each passes its own tests and leaves the worker dirty. */
const LEAKERS = {
  "spy-document": `${header}
it("spies document.querySelector and never restores it", () => {
  vi.spyOn(document, "querySelector");
});`,
  "spy-history": `${header}
it("spies history.replaceState and never restores it", () => {
  vi.spyOn(history, "replaceState");
});`,
  "spy-console": `${header}
it("silences console.error and never restores it", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});`,
  "assign-global": `${header}
it("assigns a global directly", () => {
  globalThis.fetch = () => Promise.reject(new Error("leaked"));
});`,
  "define-window-module-scope": `${header}
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({ matches: false }),
});
it("defined window.matchMedia at module scope", () => undefined);`,
  "env-write": `${header}
it("writes process.env without restoring it", () => {
  process.env.ISO272_LEAK = "1";
});`,
  "fake-timers": `${header}
it("installs fake timers and never restores real ones", () => {
  vi.useFakeTimers();
});`,
  "accessor-over-data": `${header}
it("turns a data property into an accessor that builds a new value per read", () => {
  Object.defineProperty(console, "debug", {
    configurable: true,
    get: () => () => undefined,
  });
});`,
} as const;

/** Same operations as the leakers, each undone: must pass. */
const CLEAN = `${header}
import { afterEach } from "vitest";
const original = globalThis.fetch;
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  globalThis.fetch = original;
  delete process.env.ISO272_CLEAN;
});
it("cleans up what it changes", () => {
  vi.spyOn(document, "querySelector");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers();
  globalThis.fetch = () => Promise.reject(new Error("local"));
  process.env.ISO272_CLEAN = "1";
});
it("stubs globals through vitest, which unstubGlobals undoes", () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("stubbed")));
});`;

const FIXTURE_CONFIG = `export default {
  test: {
    include: ["*.test.mjs"],
    environment: "happy-dom",
    isolate: false,
    fileParallelism: false,
    maxWorkers: 1,
    unstubGlobals: true,
    unstubEnvs: true,
    // Vitest 5.0.4 keeps run results in Vite's cacheDir (shared through the node_modules
    // symlink) and runs the files that failed last time first. Without this, the fake-timers
    // leaker can run before the clean file, which then inherits its timers and is blamed.
    cache: false,
    setupFiles: ["./scripts/vitest/leak-canary.ts"],
  },
};
`;

let dir = "";
let output = "";
let exitCode: number | null = null;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "iso272-canary-"));
  symlinkSync(
    path.join(repoRoot, "node_modules"),
    path.join(dir, "node_modules")
  );
  // Copies, not paths: a setup file outside the Vitest root is not transformed.
  mkdirSync(path.join(dir, "scripts/vitest"), { recursive: true });
  for (const file of CANARY_FILES) {
    copyFileSync(path.join(repoRoot, file), path.join(dir, file));
  }
  writeFileSync(path.join(dir, "vitest.config.mjs"), FIXTURE_CONFIG);
  writeFileSync(path.join(dir, "clean.test.mjs"), CLEAN);
  for (const [name, source] of Object.entries(LEAKERS)) {
    writeFileSync(path.join(dir, `${name}.test.mjs`), source);
  }
  const res = spawnSync(
    path.join(repoRoot, "node_modules/.bin/vitest"),
    ["run", "--root", dir, "--config", path.join(dir, "vitest.config.mjs")],
    {
      cwd: dir,
      encoding: "utf-8",
      env: { ...process.env, CI: "", FORCE_COLOR: "0", NO_COLOR: "1" },
    }
  );
  exitCode = res.status;
  output = `${res.stdout}\n${res.stderr}`;
}, RUN_TIMEOUT_MS);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** The report block Vitest prints under `FAIL  <name>.test.mjs`, or "" when it passed. */
const failureOf = (name: string): string => {
  const start = output.indexOf(`FAIL  ${name}.test.mjs`);
  if (start === -1) {
    return "";
  }
  const next = output.indexOf("\n FAIL ", start + 1);
  return output.slice(start, next === -1 ? undefined : next);
};

describe("shared-worker leak canary", () => {
  it("fails the run when test files leave globals changed", () => {
    expect(exitCode).toBe(1);
    expect(output).toContain("left shared-worker state changed");
  });

  it.each([
    ["spy-document", "document.querySelector was added"],
    ["spy-history", "history.replaceState was added"],
    ["spy-console", "console.error was replaced"],
    ["assign-global", "globalThis.fetch was replaced"],
    ["define-window-module-scope", "globalThis.matchMedia was"],
    ["env-write", "process.env.ISO272_LEAK was changed"],
    ["fake-timers", "fake timers are still installed"],
    ["accessor-over-data", "console.debug was redefined"],
  ])("blames the %s file for its leak", (name, message) => {
    expect(failureOf(name), output).toContain(message);
  });

  it("does not blame a file that restores everything it changes", () => {
    expect(failureOf("clean")).toBe("");
    // Eight leakers fail, the clean file is the one pass.
    expect(output).toMatch(/Test Files\s+8 failed \| 1 passed \(9\)/);
  });
});

describe("vitest.config.ts", () => {
  it("runs the canary in every shared-worker project", () => {
    const projects = (config.test?.projects ?? []) as {
      test?: {
        name?: string;
        isolate?: boolean;
        setupFiles?: string[];
      };
    }[];
    const shared = projects.filter(
      (project) => project.test?.isolate === false
    );
    expect(shared.length).toBeGreaterThan(0);
    for (const project of shared) {
      expect(
        project.test?.setupFiles,
        `${project.test?.name} must list the canary`
      ).toContain("scripts/vitest/leak-canary.ts");
    }
  });
});
