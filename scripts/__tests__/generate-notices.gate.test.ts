import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

function pnpmJson(names: string[]) {
  return JSON.stringify({
    MIT: names.map((name) => ({
      name,
      versions: ["1.0.0"],
      paths: [],
      license: "MIT",
      homepage: "https://example.test",
    })),
  });
}

function repoWith(names: string[]) {
  const repo = createGateRepo([
    "generate-notices.mjs",
    "lib/prod-licenses.mjs",
  ]);
  repo.write("licenses.json", pnpmJson(names));
  repo.commitAll("fixture");
  return repo;
}

const INPUT = ["--input", "licenses.json"];

describe("generate-notices", () => {
  it("fails --check when the notices file is missing or stale, passes once generated", () => {
    const repo = repoWith(["a"]);
    const missing = repo.run("generate-notices.mjs", ["--check", ...INPUT]);
    expect(missing.code).toBe(1);
    expect(missing.output).toContain("out of date");

    expect(repo.run("generate-notices.mjs", INPUT).code).toBe(0);
    expect(repo.run("generate-notices.mjs", ["--check", ...INPUT]).code).toBe(
      0
    );

    repo.write("licenses.json", pnpmJson(["a", "b"]));
    expect(repo.run("generate-notices.mjs", ["--check", ...INPUT]).code).toBe(
      1
    );
  });

  it("lists packages and leaves per-platform native binaries out", () => {
    const repo = repoWith([
      "a",
      "@esbuild/linux-x64",
      "@img/sharp-darwin-arm64",
    ]);
    repo.run("generate-notices.mjs", INPUT);
    const text = readFileSync(
      path.join(repo.dir, "THIRD_PARTY_NOTICES.md"),
      "utf-8"
    );
    expect(text).toContain("- a 1.0.0");
    expect(text).not.toContain("@esbuild/linux-x64");
    expect(text).not.toContain("@img/sharp-darwin-arm64");
  });
});
