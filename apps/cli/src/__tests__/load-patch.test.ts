import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CliExitError } from "../io";
import { loadPatch } from "../load-patch.ts";

describe("loadPatch", () => {
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
