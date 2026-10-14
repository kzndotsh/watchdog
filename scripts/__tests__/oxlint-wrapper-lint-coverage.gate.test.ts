/**
 * `shadcn/no-restyle` follows a wrapper to the vanilla primitive only while the wrapper
 * passes `className` straight through. A wrapper that builds it in a way the linter can't
 * trace (e.g. `cn(flag && "x", className)` in a helper) silently stops being checked, and
 * domain code could patch it with classes. This runs the real linter on a probe that
 * restyles every wrapper component and expects a diagnostic for each.
 *
 * The probe lives in a throwaway repo that carries the real config, plugin and wrapper
 * sources (helpers/oxlint-fixture.ts), never in the working tree.
 */
import { readdirSync, symlinkSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const PRIMITIVES = "apps/web/src/shared/ui/primitives";
const PROBE = "apps/web/src/domains/probe/probe.tsx";

/** Every wrapper module and the className-taking components that domain code renders. */
const WRAPPERS: Record<string, string[]> = {
  button: ["Button"],
  dialog: ["DialogContent"],
  "alert-dialog": ["AlertDialogContent", "AlertDialogAction"],
  combobox: ["ComboboxInput"],
};

const probeSource = () =>
  [
    ...Object.entries(WRAPPERS).map(
      ([module, names]) =>
        `import { ${names.join(", ")} } from "@/shared/ui/primitives/${module}";`
    ),
    "",
    "export const Probe = () => (",
    "  <>",
    ...Object.values(WRAPPERS)
      .flat()
      .map((name) => `    <${name} className="p-4 rounded-full" />`),
    "  </>",
    ");",
    "",
  ].join("\n");

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  for (const module of Object.keys(WRAPPERS)) {
    fixture.repo.copyFromRepo(`${PRIMITIVES}/${module}.tsx`);
  }
  // The linter reads the shadcn project config, its aliases and its stylesheet.
  for (const rel of [
    "apps/web/tsconfig.json",
    "tsconfig.base.json",
    "apps/web/components.json",
    "apps/web/src/styles.css",
    "apps/web/src/styles",
  ]) {
    fixture.repo.copyFromRepo(rel);
  }
  // The wrappers import `@watchdog/ui`, a workspace link under apps/web/node_modules.
  symlinkSync(
    path.join(repoRoot, "apps/web/node_modules"),
    path.join(fixture.repo.dir, "apps/web/node_modules"),
    "dir"
  );
  fixture.write(PROBE, probeSource());
  result = fixture.lint([PROBE]);
}, LINT_TIMEOUT_MS);

describe("wrapper lint coverage", () => {
  it("lists every wrapper module in the primitives folder", () => {
    const modules = readdirSync(path.join(repoRoot, PRIMITIVES))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => name.replace(/\.tsx$/, ""))
      .sort();
    expect(modules).toEqual(Object.keys(WRAPPERS).sort());
  });

  it("flags className restyling on every wrapper component", () => {
    const restyle = findingsFor(result, PROBE, "shadcn/no-restyle").map(
      (finding) => finding.message
    );

    for (const name of Object.values(WRAPPERS).flat()) {
      expect(
        restyle.some((message) => message.includes(`on <${name}>`)),
        `no-restyle does not check <${name}>: its wrapper hides className from the linter`
      ).toBe(true);
    }
  });
});
