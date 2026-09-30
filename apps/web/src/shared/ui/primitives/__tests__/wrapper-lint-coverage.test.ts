import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `shadcn/no-restyle` follows a wrapper to the vanilla primitive only while the wrapper
 * passes `className` straight through. A wrapper that builds it in a way the linter can't
 * trace (e.g. `cn(flag && "x", className)` in a helper) silently stops being checked, and
 * domain code could patch it with classes. This runs the real linter on a probe that
 * restyles every wrapper component and expects a diagnostic for each.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../../..");
const PRIMITIVES_DIR = path.resolve(import.meta.dirname, "..");
const PROBE_DIR = path.join(
  REPO_ROOT,
  "apps/web/src/domains/__wrapper_lint_probe__"
);

/** Every wrapper module and the className-taking components that domain code renders. */
const WRAPPERS: Record<string, string[]> = {
  button: ["Button"],
  dialog: ["DialogContent"],
  "alert-dialog": ["AlertDialogContent", "AlertDialogAction"],
  combobox: ["ComboboxInput"],
};

function probeSource(): string {
  const imports = Object.entries(WRAPPERS).map(
    ([module, names]) =>
      `import { ${names.join(", ")} } from "@/shared/ui/primitives/${module}";`
  );
  const usages = Object.values(WRAPPERS)
    .flat()
    .map((name) => `    <${name} className="p-4 rounded-full" />`);
  return [
    ...imports,
    "",
    "export const Probe = () => (",
    "  <>",
    ...usages,
    "  </>",
    ");",
    "",
  ].join("\n");
}

interface Diagnostic {
  code: string;
  message: string;
}

function lintProbe(): Diagnostic[] {
  mkdirSync(PROBE_DIR, { recursive: true });
  const file = path.join(PROBE_DIR, "probe.tsx");
  writeFileSync(file, probeSource());
  try {
    // oxlint exits non-zero when it reports errors: read stdout either way.
    let stdout = "";
    try {
      stdout = execFileSync(
        "pnpm",
        ["exec", "oxlint", "-c", "oxlint.config.ts", "--format", "json", file],
        { cwd: REPO_ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "stdout" in error &&
        typeof error.stdout === "string"
      ) {
        stdout = error.stdout;
      } else {
        throw error;
      }
    }
    const parsed: unknown = JSON.parse(stdout.slice(stdout.indexOf("{")));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("diagnostics" in parsed) ||
      !Array.isArray(parsed.diagnostics)
    ) {
      throw new TypeError("unexpected oxlint JSON output");
    }
    return parsed.diagnostics as Diagnostic[];
  } finally {
    rmSync(PROBE_DIR, { recursive: true, force: true });
  }
}

describe("wrapper lint coverage", () => {
  it("lists every wrapper module in the primitives folder", () => {
    const modules = readdirSync(PRIMITIVES_DIR)
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => name.replace(/\.tsx$/, ""))
      .sort();
    expect(modules).toEqual(Object.keys(WRAPPERS).sort());
  });

  it("flags className restyling on every wrapper component", () => {
    const restyle = lintProbe()
      .filter((d) => d.code === "shadcn(no-restyle)")
      .map((d) => d.message);

    for (const name of Object.values(WRAPPERS).flat()) {
      expect(
        restyle.some((message) => message.includes(`on <${name}>`)),
        `no-restyle does not check <${name}>: its wrapper hides className from the linter`
      ).toBe(true);
    }
  });
});
