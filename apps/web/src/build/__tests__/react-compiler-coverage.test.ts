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
] as const;

type Outcome =
  | { compiled: true }
  | { compiled: false; reasons: string[] };

/** The parts of the compiler's logger events this check reads (errors carry `fnLoc`, not `fnName`). */
type CompilerEvent = {
  kind: string;
  fnName?: string | null;
  fnLoc?: { start: { line: number }; end: { line: number } } | null;
  detail?: { options?: { reason?: string }; reason?: string };
  reason?: string;
};

/** 1-based line where `component` is declared, to match an event by its `fnLoc`. */
function declarationLine(source: string, component: string): number {
  const declaration = new RegExp(
    `(?:function|const)\\s+${component}\\b`
  ).exec(source);
  if (!declaration) {
    throw new Error(`${component} is not declared in the file`);
  }
  return source.slice(0, declaration.index).split("\n").length;
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
  const result = transformSync(source, {
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
  const code = result?.code ?? "";
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
  const memoized =
    mine.some((event) => event.kind === "CompileSuccess") &&
    code.includes("react/compiler-runtime") &&
    /\b_c\(\d+\)/.test(code);
  if (memoized && reasons.length === 0) {
    return { compiled: true };
  }
  return {
    compiled: false,
    reasons: reasons.length > 0 ? reasons : ["no memo cache (_c) in the output"],
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
