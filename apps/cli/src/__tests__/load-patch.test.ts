import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CliExitError } from "../io";
import { loadPatch } from "../load-patch.ts";

describe("loadPatch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a malformed op before any request, naming the field", () => {
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      printed.push(String(line));
    });
    const op = {
      kind: "claim.create",
      id: "00000000-0000-4000-8000-000000000002",
      data: {
        entityId: "00000000-0000-4000-8000-000000000003",
        text: "observed",
        confidence: "confirmed",
      },
    };
    expect(() => loadPatch({ patch: JSON.stringify([op]) })).toThrow(
      CliExitError
    );
    expect(printed.join("")).toContain(
      "0.data: op.data.confidence is forbidden"
    );
  });

  it("returns the typed ops of a valid patch", () => {
    const op = {
      kind: "question.create",
      id: " 00000000-0000-4000-8000-000000000002 ",
      data: { entityId: "00000000-0000-4000-8000-000000000003", text: "Who?" },
    };
    expect(loadPatch({ patch: JSON.stringify([op]) })).toEqual([
      { ...op, id: "00000000-0000-4000-8000-000000000002" },
    ]);
  });

  it("rejects invalid JSON", () => {
    expect(() => loadPatch({ patch: "{not json" })).toThrow(CliExitError);
  });

  it("rejects a non-array patch file", () => {
    const patchPath = path.join(tmpdir(), `wd-patch-${Date.now()}.json`);
    writeFileSync(patchPath, JSON.stringify({ op: "create" }));
    expect(() => loadPatch({ "patch-file": patchPath })).toThrow(CliExitError);
  });

  it("rejects an empty patch array", () => {
    expect(() => loadPatch({ patch: "[]" })).toThrow(CliExitError);
  });

  it("rejects whitespace-only patch content", () => {
    expect(() => loadPatch({ patch: "   " })).toThrow(CliExitError);
  });

  it("rejects a missing patch file with USAGE", () => {
    expect(() =>
      loadPatch({ "patch-file": "/tmp/wd-missing-patch-file.json" })
    ).toThrow(CliExitError);
  });
});
