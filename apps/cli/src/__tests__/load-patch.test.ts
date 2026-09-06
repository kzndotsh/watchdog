import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadPatch } from "../load-patch.ts";

describe("loadPatch", () => {
  it("rejects invalid JSON", () => {
    expect(() => loadPatch({ patch: "{not json" })).toThrow(/valid JSON/);
  });

  it("rejects a non-array patch file", () => {
    const patchPath = path.join(tmpdir(), `wd-patch-${Date.now()}.json`);
    writeFileSync(patchPath, JSON.stringify({ op: "create" }));
    expect(() => loadPatch({ "patch-file": patchPath })).toThrow();
  });
});
