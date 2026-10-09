/**
 * Test seam for oxlint rules: build a throwaway git repo holding the real
 * `oxlint.config.ts` and the real `scripts/oxlint-plugin/` tree, write fixture source
 * files into it, run the real oxlint binary and assert on the diagnostics (rule id,
 * message, location). Nothing is written into the real working tree, and tests never
 * import rule code: they exercise the rule exactly as `pnpm check` does.
 *
 * Fixture paths are repo-relative because the config's `files` globs are
 * (`packages/core/src/**`, `packages/schemas/src/testing/**`, ...).
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

import { gateRepoFactory } from "./gate-repo.ts";
import type { GateRepo } from "./gate-repo.ts";

/**
 * Timeout for a hook or test that runs oxlint: a cold run is a second or two, but the
 * gate project runs many files in parallel and the default 5s/10s is easy to exceed.
 */
export const LINT_TIMEOUT_MS = 60_000;

const repoRoot = path.resolve(import.meta.dirname, "../../..");

/** One diagnostic from `oxlint --format json`, with the plugin/rule split out of `code`. */
export interface LintFinding {
  /** Rule id as written in the config, e.g. `watchdog/no-brand-cast`. */
  readonly rule: string;
  readonly message: string;
  /** Repo-relative path of the linted file. */
  readonly file: string;
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
}

export interface LintResult {
  readonly code: number;
  /** stdout + stderr; stdout is the JSON report. */
  readonly output: string;
  readonly findings: readonly LintFinding[];
}

export interface OxlintFixture {
  readonly repo: GateRepo;
  /** Write a fixture file (creating parent dirs) at a repo-relative path. */
  write: (rel: string, content: string) => void;
  /**
   * Run oxlint over repo-relative `paths` (default: the whole fixture). `config` names
   * another fixture-relative config (default: the real `oxlint.config.ts`).
   */
  lint: (
    paths?: readonly string[],
    options?: { readonly config?: string }
  ) => LintResult;
}

interface RawDiagnostic {
  readonly code?: string;
  readonly message?: string;
  readonly filename?: string;
  readonly labels?: readonly {
    readonly span?: { readonly line?: number; readonly column?: number };
  }[];
}

/** `watchdog(no-brand-cast)` becomes `watchdog/no-brand-cast`; core rules are `eslint(x)` etc. */
const ruleId = (code: string) => {
  const match = /^([^(]+)\((.+)\)$/.exec(code);
  return match ? `${match[1]}/${match[2]}` : code;
};

const toFinding = (d: RawDiagnostic): LintFinding => {
  const span = d.labels?.[0]?.span;
  return {
    rule: ruleId(d.code ?? ""),
    message: d.message ?? "",
    file: d.filename ?? "",
    line: span?.line ?? 0,
    column: span?.column ?? 0,
  };
};

/**
 * A rule that throws surfaces as a diagnostic, not a non-zero exit, so a "passes"
 * assertion could succeed vacuously. Treat it as a harness failure instead.
 */
const PLUGIN_CRASH = "Error running JS plugin";

const parseReport = (stdout: string): readonly LintFinding[] => {
  let report: { diagnostics?: RawDiagnostic[] };
  try {
    report = JSON.parse(stdout);
  } catch {
    return [];
  }
  const crash = (report.diagnostics ?? []).find((d) =>
    d.message?.startsWith(PLUGIN_CRASH)
  );
  if (crash) throw new Error(crash.message);
  return (report.diagnostics ?? []).map(toFinding);
};

/** Findings for `rule` (all rules when omitted) in `file`, a path suffix such as `probe/x.ts`. */
export const findingsFor = (
  result: LintResult,
  file: string,
  rule?: string
): readonly LintFinding[] =>
  result.findings.filter(
    (f) => f.file.endsWith(file) && (rule === undefined || f.rule === rule)
  );

/**
 * Registers cleanup and returns a factory. The fixture lives for the whole test file
 * (`lifetime: "suite"`, the default here) because linting is the slow step: build one
 * fixture in `beforeAll`, lint once, assert many times. Pass `"test"` for a fixture a
 * single test mutates and re-lints.
 */
export function oxlintFixtureFactory({
  lifetime = "suite",
}: { readonly lifetime?: "test" | "suite" } = {}) {
  const createGateRepo = gateRepoFactory({ lifetime });

  return function createOxlintFixture(): OxlintFixture {
    const repo = createGateRepo([]);
    repo.copyFromRepo("oxlint.config.ts");
    repo.copyFromRepo("scripts/oxlint-plugin");
    // Committed baselines name real repo files; a fixture starts with none and writes its own.
    rmSync(path.join(repo.dir, "scripts/oxlint-plugin/baselines"), {
      recursive: true,
      force: true,
    });
    // The config lists `apps/web/.../primitives/*.tsx` at load time; an empty dir suffices.
    repo.write("apps/web/src/shared/ui/primitives/.keep", "");
    repo.write(
      "package.json",
      '{ "name": "oxlint-fixture", "private": true }\n'
    );

    return {
      repo,
      write: repo.write,
      lint(paths = ["."], { config = "oxlint.config.ts" } = {}) {
        const res = spawnSync(
          path.join(repoRoot, "node_modules/.bin/oxlint"),
          ["-c", config, "--format", "json", ...paths],
          { cwd: repo.dir, encoding: "utf-8" }
        );
        const stdout = res.stdout ?? "";
        return {
          code: res.status ?? -1,
          output: `${stdout}${res.stderr ?? ""}`,
          findings: parseReport(stdout),
        };
      },
    };
  };
}
