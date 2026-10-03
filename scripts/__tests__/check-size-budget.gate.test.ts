import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "check-size-budget.mjs";
const BIG = "apps/web/src/big.ts";
const BASELINE = "scripts/size-budget-baseline.json";

/** A file whose `split("\n")` length is exactly `n` lines. */
const lines = (n: number) => `${"x\n".repeat(n - 1)}x`;

function repoWith(files: Record<string, string>, baseline = {}) {
  const repo = createGateRepo([GATE]);
  repo.write(BASELINE, JSON.stringify(baseline));
  for (const [rel, content] of Object.entries(files)) {
    repo.write(rel, content);
  }
  repo.commitAll("fixture");
  return repo;
}

describe("check-size-budget gate", () => {
  it("passes a file at the 600-line budget", () => {
    const repo = repoWith({ [BIG]: lines(600) });

    const res = repo.run(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toContain("check:size: ok");
  });

  it("fails a new file over budget that is not baselined", () => {
    const repo = repoWith({ [BIG]: lines(601) });

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain(`${BIG}: 601 lines`);
    expect(res.output).toContain("split it");
  });

  it("passes a baselined over-budget file that has not grown", () => {
    const repo = repoWith({ [BIG]: lines(650) }, { [BIG]: 650 });

    expect(repo.run(GATE).code).toBe(0);
  });

  it("fails a baselined file that grew past its baseline", () => {
    const repo = repoWith({ [BIG]: lines(651) }, { [BIG]: 650 });

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("over-budget files may only shrink");
  });

  it("exempts tests and generated files", () => {
    const repo = repoWith({
      "apps/web/src/big.test.ts": lines(700),
      "packages/core/src/__tests__/big.ts": lines(700),
      "apps/web/src/routeTree.gen.ts": lines(700),
    });

    expect(repo.run(GATE).code).toBe(0);
  });
});
