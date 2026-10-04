import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract for spec #58 (ticket #84): every package, app and test project extends the
 * one root `tsconfig.base.json` instead of copying compiler options, and no package
 * borrows another app's config (caps used to extend `apps/web/tsconfig.json`).
 *
 * `checkTsconfigs` is a pure function over parsed configs so must-fail fixtures need no
 * filesystem; the last test runs it over the tracked tsconfig files.
 */
const repoRoot = path.resolve(import.meta.dirname, "../..");
const BASE = "tsconfig.base.json";

/** Strip `//` and block comments (outside strings) and trailing commas from JSONC. */
const stripJsonc = (text: string): string => {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    const next = text.charAt(i + 1);
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text.charAt(j) !== '"') {
        j += text.charAt(j) === "\\" ? 2 : 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "/" && next === "/") {
      while (i < text.length && text.charAt(i) !== "\n") {
        i += 1;
      }
    } else if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out.replaceAll(/,(\s*[}\]])/g, "$1");
};

const parseTsconfig = (text: string): unknown => JSON.parse(stripJsonc(text));

/** Repo-relative path -> parsed tsconfig. */
type Configs = ReadonlyMap<string, unknown>;

const extendsOf = (config: unknown): string[] => {
  if (typeof config !== "object" || config === null || !("extends" in config)) {
    return [];
  }
  const value = config.extends;
  if (typeof value === "string") {
    return [value];
  }
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
};

/** Local (relative) extends targets resolved to repo-relative paths; packages are skipped. */
const localParents = (file: string, config: unknown): string[] =>
  extendsOf(config)
    .filter((e) => e.startsWith("."))
    .map((e) => {
      const resolved = path.posix.join(path.posix.dirname(file), e);
      return resolved.endsWith(".json") ? resolved : `${resolved}.json`;
    });

const reachesBase = (
  file: string,
  configs: Configs,
  seen = new Set<string>()
): boolean => {
  if (file === BASE) {
    return true;
  }
  if (seen.has(file)) {
    return false;
  }
  seen.add(file);
  const config = configs.get(file);
  return (
    config !== undefined &&
    localParents(file, config).some((p) => reachesBase(p, configs, seen))
  );
};

const isWorkspaceConfig = (file: string) =>
  /^(apps|packages)\/[^/]+\/tsconfig(\.test)?\.json$/.test(file);

/** Returns one message per broken rule; empty when the configs satisfy the contract. */
const checkTsconfigs = (configs: Configs): string[] => {
  const problems: string[] = [];
  if (!configs.has(BASE)) {
    problems.push(`${BASE} is missing`);
  }
  for (const [file, config] of configs) {
    if (file === BASE) {
      continue;
    }
    if (!reachesBase(file, configs)) {
      problems.push(
        `${file} does not extend ${BASE} (directly or via a chain)`
      );
    }
    const dir = path.posix.dirname(file);
    for (const parent of localParents(file, config)) {
      if (parent.startsWith("apps/web/") && !dir.startsWith("apps/web")) {
        problems.push(
          `${file} extends ${parent}: no package borrows the web app's config`
        );
      }
    }
    if (file.endsWith("/tsconfig.test.json") && isWorkspaceConfig(file)) {
      const sibling = `${dir}/tsconfig.json`;
      if (
        configs.has(sibling) &&
        !localParents(file, config).includes(sibling)
      ) {
        problems.push(
          `${file} must extend ./tsconfig.json (test config extends source config)`
        );
      }
    }
  }
  return problems;
};

const fixture = (entries: Record<string, unknown>): Configs =>
  new Map(Object.entries(entries));

const BASE_CONFIG = { compilerOptions: { strict: true } };

describe("tsconfig base contract", () => {
  it("passes when packages, tests and the root extend the base", () => {
    const configs = fixture({
      [BASE]: BASE_CONFIG,
      "tsconfig.json": { extends: "./tsconfig.base.json" },
      "packages/a/tsconfig.json": { extends: "../../tsconfig.base.json" },
      "packages/a/tsconfig.test.json": { extends: "./tsconfig.json" },
      "apps/site/tsconfig.json": {
        extends: ["../../tsconfig.base.json", "astro/tsconfigs/strict"],
      },
    });

    expect(checkTsconfigs(configs)).toEqual([]);
  });

  it("fails a package tsconfig that copies options instead of extending the base", () => {
    const configs = fixture({
      [BASE]: BASE_CONFIG,
      "packages/a/tsconfig.json": { compilerOptions: { strict: true } },
    });

    expect(checkTsconfigs(configs)).toEqual([
      "packages/a/tsconfig.json does not extend tsconfig.base.json (directly or via a chain)",
    ]);
  });

  it("fails a package that extends the web app's config", () => {
    const configs = fixture({
      [BASE]: BASE_CONFIG,
      "apps/web/tsconfig.json": { extends: "../../tsconfig.base.json" },
      "packages/caps/tsconfig.json": {
        extends: "../../apps/web/tsconfig.json",
      },
    });

    const problems = checkTsconfigs(configs);

    expect(problems).toContain(
      "packages/caps/tsconfig.json extends apps/web/tsconfig.json: no package borrows the web app's config"
    );
  });

  it("fails a test config that does not extend its package config", () => {
    const configs = fixture({
      [BASE]: BASE_CONFIG,
      "packages/a/tsconfig.json": { extends: "../../tsconfig.base.json" },
      "packages/a/tsconfig.test.json": { extends: "../../tsconfig.base.json" },
    });

    expect(checkTsconfigs(configs)).toEqual([
      "packages/a/tsconfig.test.json must extend ./tsconfig.json (test config extends source config)",
    ]);
  });

  it("fails an extends cycle that never reaches the base", () => {
    const configs = fixture({
      [BASE]: BASE_CONFIG,
      "packages/a/tsconfig.json": { extends: "./tsconfig.test.json" },
      "packages/a/tsconfig.test.json": { extends: "./tsconfig.json" },
    });

    expect(checkTsconfigs(configs).length).toBeGreaterThan(0);
  });

  it("fails when the base file itself is missing", () => {
    expect(checkTsconfigs(fixture({}))).toEqual([`${BASE} is missing`]);
  });

  it("parses JSONC comments and trailing commas without touching strings", () => {
    const parsed = parseTsconfig(
      '{\n // line\n "extends": "./a//b.json", /* block */ "x": [1,],\n}'
    );

    expect(parsed).toEqual({ extends: "./a//b.json", x: [1] });
  });

  it("holds for every tracked tsconfig in the repository", () => {
    const tracked = execFileSync("git", ["ls-files", "*tsconfig*.json"], {
      cwd: repoRoot,
      encoding: "utf-8",
    })
      .split("\n")
      .filter(Boolean);
    const configs = new Map<string, unknown>(
      tracked.map((file) => [
        file,
        parseTsconfig(readFileSync(path.join(repoRoot, file), "utf-8")),
      ])
    );

    expect(checkTsconfigs(configs)).toEqual([]);
  });
});
