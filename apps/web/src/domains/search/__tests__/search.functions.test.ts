import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import { searchCaseFn } from "@/domains/search/search.functions";
import { callServerFn, orpc } from "@/testing/server-fn";
import { testId } from "@watchdog/test-kit";

beforeEach(() => orpc.reset());

describe("searchCaseFn", () => {
  it("refuses a Case id that is not a uuid", async () => {
    await expect(
      callServerFn(searchCaseFn, { caseId: "x", q: "alpha" })
    ).rejects.toThrow();

    expect(orpc.calls("search.case")).toEqual([]);
  });

  it("trims a padded Case id before the API sees it", async () => {
    orpc.reply("search.case", {
      q: "alpha",
      entities: [],
      identifiers: [],
      evidence: [],
      tasks: [],
      jobs: [],
      proposals: [],
      cases: [],
      evidenceLabels: {},
      entityLabels: {},
    });

    await callServerFn(searchCaseFn, {
      caseId: `  ${testId(10)}  `,
      q: "alpha",
    });

    expect(orpc.calls("search.case")).toMatchObject([
      { caseId: testId(10), q: "alpha" },
    ]);
  });
});
