/**
 * Test seam for gate scripts: build a throwaway git repo, copy gate scripts into
 * it, and run them exactly as lefthook or CI would (`node scripts/<gate>.mjs`).
 * Tests assert on exit code and output phrases only; they never import gate code.
 *
 * Gate processes get their own environment object (`spawnSync` `env`), so nothing
 * here mutates `process.env`; the shared-worker restore rule is satisfied by
 * construction. Ambient `GIT_*` variables (set when tests run inside a git hook)
 * are stripped so fixture git commands never touch the real repository.
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

export interface GateResult {
  readonly code: number;
  /** stdout + stderr, interleaving not preserved. */
  readonly output: string;
}

export interface GateRepo {
  readonly dir: string;
  /** Write a file (creating parent dirs) relative to the fixture root. */
  write: (rel: string, content: string) => void;
  git: (...args: string[]) => string;
  /** Stage everything and commit. */
  commitAll: (message: string) => void;
  /** Copy a file from the real repo into the same relative path in the fixture. */
  copyFromRepo: (rel: string) => void;
  /** Run `node <rel> ...args` in the fixture, optionally feeding stdin. */
  runFile: (
    rel: string,
    options?: {
      args?: readonly string[];
      input?: string;
      env?: Record<string, string>;
    }
  ) => GateResult;
  /** Run `node scripts/<script> ...args` in the fixture. */
  run: (
    script: string,
    args?: readonly string[],
    env?: Record<string, string>
  ) => GateResult;
}

/**
 * Ambient variables a gate must never inherit: `GIT_*` would aim fixture git at the
 * real repository; `CI` / `GITHUB_*` / `DOCS_AFFECT_*` would silently switch gates
 * into CI mode when the suite itself runs under GitHub Actions. A test that wants
 * CI mode passes them explicitly through the `env` option.
 */
const AMBIENT = /^(GIT_|GITHUB_|DOCS_AFFECT_)/;

function cleanEnv(extra: Record<string, string> = {}) {
  const inherited = Object.entries(process.env).filter(
    ([key]) => !AMBIENT.test(key) && key !== "CI"
  );
  return { ...Object.fromEntries(inherited), ...extra };
}

/**
 * Registers per-test cleanup and returns a factory. `scripts` are file names
 * under the real `scripts/` dir that get copied into the fixture's `scripts/`.
 */
export function gateRepoFactory() {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  return function createGateRepo(scripts: readonly string[]): GateRepo {
    const dir = mkdtempSync(path.join(tmpdir(), "wd-gate-"));
    dirs.push(dir);

    const git = (...args: string[]) => {
      const res = spawnSync("git", args, {
        cwd: dir,
        encoding: "utf-8",
        env: cleanEnv(),
      });
      if (res.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${res.stderr}`);
      }
      return res.stdout;
    };

    const write = (rel: string, content: string) => {
      const abs = path.join(dir, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    };

    git("init", "--quiet", "--initial-branch=main");
    git("config", "user.email", "gate@example.test");
    git("config", "user.name", "Gate Fixture");
    git("config", "commit.gpgsign", "false");

    mkdirSync(path.join(dir, "scripts"));
    for (const script of scripts) {
      // Nested entries such as `lib/git-range.mjs` keep their layout.
      mkdirSync(path.dirname(path.join(dir, "scripts", script)), {
        recursive: true,
      });
      cpSync(
        path.join(repoRoot, "scripts", script),
        path.join(dir, "scripts", script)
      );
    }
    // Gate scripts import third-party packages (e.g. `yaml`); resolve them from the real install.
    if (existsSync(path.join(repoRoot, "node_modules"))) {
      symlinkSync(
        path.join(repoRoot, "node_modules"),
        path.join(dir, "node_modules"),
        "dir"
      );
      appendFileSync(path.join(dir, ".git/info/exclude"), "node_modules\n");
    }

    return {
      dir,
      write,
      git,
      commitAll(message) {
        git("add", "-A");
        git("commit", "--quiet", "-m", message);
      },
      copyFromRepo(rel) {
        mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        cpSync(path.join(repoRoot, rel), path.join(dir, rel));
      },
      runFile(rel, { args = [], input, env = {} } = {}) {
        const res = spawnSync(process.execPath, [rel, ...args], {
          cwd: dir,
          encoding: "utf-8",
          env: cleanEnv(env),
          input,
        });
        return {
          code: res.status ?? -1,
          output: `${res.stdout}${res.stderr}`,
        };
      },
      run(script, args = [], env = {}) {
        return this.runFile(path.join("scripts", script), { args, env });
      },
    };
  };
}
