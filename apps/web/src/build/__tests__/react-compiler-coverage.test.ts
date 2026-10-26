import { readFileSync } from "node:fs";
import path from "node:path";

import { transformSync } from "@babel/core";
import { describe, expect, it } from "vitest";

import { reactCompilerBabelPreset } from "../../../react-compiler.ts";

/**
 * The React Compiler skips a component it cannot handle and the build still passes
 * (#389: under Babel 8 every component that destructures props with defaults was left
 * uncompiled, `DataTable` included). This compiles a fixed list of components with the
 * app's own compiler config (`apps/web/react-compiler.ts`) and fails, naming the component,
 * when one is not compiled or the compiler reports a CompileError for it.
 */

const webSrc = path.join(import.meta.dirname, "../..");

/** Components that must stay compiled. Add one when its behaviour depends on memoization. */
const MUST_COMPILE = [
  { file: "shared/ui/data-table/data-table.tsx", component: "DataTable" },
  // Destructures props with defaults: the shape that regressed in #389.
  { file: "shared/ui/section-header-bar.tsx", component: "SectionHeaderBar" },
  // The list standard (#551): every list screen renders through these, and the compiler is
  // what keeps a toolbar keystroke from re-rendering every row.
  { file: "shared/ui/list/list-toolbar.tsx", component: "ListToolbar" },
  { file: "shared/ui/list/list-table.tsx", component: "ListTable" },
  { file: "shared/ui/list/list-body.tsx", component: "ListBody" },
  { file: "shared/ui/list/list-search.tsx", component: "ListSearch" },
  { file: "shared/ui/list/list-filters-button.tsx", component: "ListFiltersButton" },
  { file: "shared/ui/list/list-filter-row.tsx", component: "ListFilterRow" },
  { file: "shared/ui/list/list-filter-chips.tsx", component: "ListFilterChips" },
  { file: "shared/ui/list/list-display-button.tsx", component: "ListDisplayButton" },
  // The popover bodies load on first open as their own chunks (#560); they compile like the rest.
  { file: "shared/ui/list/parts/filters-popover-body.tsx", component: "FiltersPopoverBody" },
  { file: "shared/ui/list/parts/display-popover-body.tsx", component: "DisplayPopoverBody" },
  { file: "shared/ui/list/list-footer.tsx", component: "ListFooter" },
  { file: "shared/ui/list/list-count.tsx", component: "ListCount" },
] as const;

type Outcome =
  | { compiled: true }
  | { compiled: false; reasons: string[] };

/** The parts of the compiler's logger events this check reads (errors carry `fnLoc`, not `fnName`). */
type CompilerEvent = {
  kind: string;
  fnName?: string | null;
  memoSlots?: number;
  fnLoc?: { start: { line: number }; end: { line: number } } | null;
  detail?: { options?: { reason?: string }; reason?: string };
  reason?: string;
};

/** 1-based line where `component` is declared, to match an event by its `fnLoc`. */
function declarationLine(source: string, component: string): number {
  const index = [`function ${component}`, `const ${component} `]
    .map((needle) => source.indexOf(needle))
    .find((found) => found !== -1);
  if (index === undefined) {
    throw new Error(`${component} is not declared in the file`);
  }
  return source.slice(0, index).split("\n").length;
}

function eventReason(event: CompilerEvent): string {
  return (
    event.detail?.options?.reason ??
    event.detail?.reason ??
    event.reason ??
    "no reason given"
  );
}

/** The compiler plugin and options inside the app's preset, so the check compiles with the shipped config. */
function compilerPlugin(): { pluginPath: string; options: object } {
  const { preset } = reactCompilerBabelPreset("infer");
  const plugin = typeof preset === "function" ? preset({}).plugins?.[0] : null;
  if (Array.isArray(plugin) && typeof plugin[0] === "string") {
    return { pluginPath: plugin[0], options: plugin[1] ?? {} };
  }
  throw new Error("The React Compiler preset no longer exposes its Babel plugin");
}

/** Compile one file the way the app does and say whether `component` came out memoized. */
function compileOutcome(filePath: string, component: string): Outcome {
  const events: CompilerEvent[] = [];
  const { pluginPath, options } = compilerPlugin();
  const source = readFileSync(filePath, "utf8");
  transformSync(source, {
    filename: filePath,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [
      [
        pluginPath,
        {
          ...options,
          logger: {
            logEvent: (_file: string, event: CompilerEvent) => {
              events.push(event);
            },
          },
        },
      ],
    ],
  });
  const line = declarationLine(source, component);
  const mine = events.filter(
    (event) =>
      event.fnName === component ||
      (event.fnLoc != null &&
        event.fnLoc.start.line <= line &&
        line <= event.fnLoc.end.line)
  );
  const reasons = mine
    .filter((event) => event.kind !== "CompileSuccess")
    .map((event) => `${event.kind}: ${eventReason(event)}`);
  // Per function, not per file: a sibling that compiled must not vouch for this component.
  const memoized = mine.some(
    (event) =>
      event.kind === "CompileSuccess" &&
      event.fnName === component &&
      (event.memoSlots ?? 0) > 0
  );
  if (memoized && reasons.length === 0) {
    return { compiled: true };
  }
  return {
    compiled: false,
    reasons:
      reasons.length > 0 ? reasons : ["no compiled function with a memo cache"],
  };
}

function describeFailure(component: string, outcome: Outcome): string {
  return outcome.compiled
    ? ""
    : `React Compiler did not compile ${component}: ${outcome.reasons.join("; ")}`;
}

describe("React Compiler coverage", () => {
  it.each(MUST_COMPILE)("compiles $component", ({ file, component }) => {
    const outcome = compileOutcome(path.join(webSrc, file), component);
    expect(outcome.compiled, describeFailure(component, outcome)).toBe(true);
  });

  describe("detects a bailout", () => {
    const fixtures = path.join(import.meta.dirname, "fixtures");

    it("reports a component marked 'use no memo' as not compiled", () => {
      const outcome = compileOutcome(
        path.join(fixtures, "opted-out.tsx"),
        "OptedOut"
      );
      expect(outcome.compiled).toBe(false);
    });

    it("reports only the skipped component of a file with a compiled sibling", () => {
      const file = path.join(fixtures, "mixed.tsx");
      expect(compileOutcome(file, "Compiled").compiled).toBe(true);
      const outcome = compileOutcome(file, "Skipped");
      expect(outcome.compiled).toBe(false);
      expect(describeFailure("Skipped", outcome)).toMatch(
        /did not compile Skipped/
      );
    });

    it("reports a CompileError for a component the compiler rejects", () => {
      const outcome = compileOutcome(
        path.join(fixtures, "rejected.tsx"),
        "Rejected"
      );
      expect(outcome).toMatchObject({ compiled: false });
      expect(describeFailure("Rejected", outcome)).toMatch(
        /did not compile Rejected: CompileError/
      );
    });
  });
});
