import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

type Fixture = Record<string, { name: string; license: string }[]>;

/** The `pnpm licenses list --json` shape: licenses map to package lists. */
function pnpmJson(entries: Fixture) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(entries).map(([license, pkgs]) => [
        license,
        pkgs.map((p) => ({
          name: p.name,
          versions: ["1.0.0"],
          paths: [],
          license,
          homepage: "https://example.test",
        })),
      ])
    )
  );
}

function repoWith(entries: Fixture, exceptions: object = {}) {
  const repo = createGateRepo(["check-licenses.mjs", "lib/prod-licenses.mjs"]);
  repo.write("scripts/license-exceptions.json", JSON.stringify(exceptions));
  repo.write("licenses.json", pnpmJson(entries));
  repo.commitAll("fixture");
  return repo;
}

const INPUT = ["--input", "licenses.json"];

describe("check-licenses", () => {
  it("passes permissive, weak copyleft and SPDX expressions with an allowed side", () => {
    const res = repoWith({
      MIT: [{ name: "a", license: "MIT" }],
      "MPL-2.0": [{ name: "b", license: "MPL-2.0" }],
      "LGPL-3.0-or-later": [{ name: "c", license: "LGPL-3.0-or-later" }],
      "(AFL-2.1 OR BSD-3-Clause)": [
        { name: "d", license: "(AFL-2.1 OR BSD-3-Clause)" },
      ],
    }).run("check-licenses.mjs", INPUT);
    expect(res.code).toBe(0);
    expect(res.output).toContain("check:licenses: ok");
  });

  it("fails a license outside the allowlist and names the package", () => {
    const res = repoWith({
      "GPL-2.0-only": [{ name: "copyleft-pkg", license: "GPL-2.0-only" }],
    }).run("check-licenses.mjs", INPUT);
    expect(res.code).toBe(1);
    expect(res.output).toContain("copyleft-pkg@1.0.0: GPL-2.0-only");
  });

  it("fails an Unknown license without a reviewed exception", () => {
    const res = repoWith({
      Unknown: [{ name: "mystery", license: "Unknown" }],
    }).run("check-licenses.mjs", INPUT);
    expect(res.code).toBe(1);
    expect(res.output).toContain("mystery@1.0.0: Unknown");
  });

  it("fails an AND expression when one side is not allowed", () => {
    const res = repoWith({
      "MIT AND SSPL-1.0": [{ name: "both", license: "MIT AND SSPL-1.0" }],
    }).run("check-licenses.mjs", INPUT);
    expect(res.code).toBe(1);
  });

  it("fails when a parenthesized OR group is ANDed with a disallowed license", () => {
    const expr = "(MIT OR Apache-2.0) AND SSPL-1.0";
    const res = repoWith({
      [expr]: [{ name: "mixed", license: expr }],
    }).run("check-licenses.mjs", INPUT);
    expect(res.code).toBe(1);
    expect(res.output).toContain("mixed@1.0.0");
  });

  it("passes a parenthesized expression whose AND group is allowed", () => {
    const expr = "(MIT AND ISC) OR SSPL-1.0";
    const res = repoWith({
      [expr]: [{ name: "mixed", license: expr }],
    }).run("check-licenses.mjs", INPUT);
    expect(res.code).toBe(0);
  });

  it("fails an expression that does not parse", () => {
    const res = repoWith({
      "(MIT": [{ name: "broken", license: "(MIT" }],
    }).run("check-licenses.mjs", INPUT);
    expect(res.code).toBe(1);
  });

  it("passes a reviewed exception only for the license it was reviewed under", () => {
    const exceptions = {
      mystery: { reported: "Unknown", license: "MIT", reason: "reviewed" },
    };
    const ok = repoWith(
      { Unknown: [{ name: "mystery", license: "Unknown" }] },
      exceptions
    ).run("check-licenses.mjs", INPUT);
    expect(ok.code).toBe(0);

    const changed = repoWith(
      { "GPL-2.0-only": [{ name: "mystery", license: "GPL-2.0-only" }] },
      exceptions
    ).run("check-licenses.mjs", INPUT);
    expect(changed.code).toBe(1);
  });
});
