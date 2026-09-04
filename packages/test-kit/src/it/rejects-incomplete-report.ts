import { expect, it } from "vitest";

import type { JsonObject } from "@watchdog/cap-sdk";

interface InterpretableCap {
  id: string;
  interpret?: (...args: never[]) => unknown;
}

/**
 * Shared Cap test-case factory. Call inside `describe`, not inside `it`.
 */
export function itRejectsIncompleteReport(
  cap: InterpretableCap,
  incompleteReport: JsonObject,
  input: JsonObject = {}
): void {
  it("rejects incomplete report", () => {
    expect(cap.interpret).toBeDefined();
    const { interpret } = cap;
    if (interpret === undefined) {
      throw new Error(`${cap.id} has no interpret`);
    }
    const errorTarget = cap.id.includes(".")
      ? cap.id.slice(cap.id.indexOf(".") + 1)
      : cap.id;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- per-Cap interpret input is generic
    const run = interpret as (
      report: JsonObject,
      opts: { input: JsonObject }
    ) => unknown;
    expect(() => run(incompleteReport, { input })).toThrow(
      new RegExp(
        `Invalid (${cap.id.replaceAll(".", "\\.")}|${errorTarget.replaceAll(".", "\\.")})`
      )
    );
  });
}
