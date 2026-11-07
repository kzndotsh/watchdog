import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import { listRecentActivityFn } from "@/domains/activity/activity.functions";
import { callServerFn, orpc } from "@/testing/server-fn";
import { testId } from "@watchdog/test-kit";

beforeEach(() => orpc.reset());

describe("listRecentActivityFn", () => {
  it("refuses a Case id that is not a uuid", async () => {
    await expect(
      callServerFn(listRecentActivityFn, { caseId: "case-1" })
    ).rejects.toThrow();

    expect(orpc.calls("activity.listRecent")).toEqual([]);
  });

  it("trims a padded Case id before the API sees it", async () => {
    orpc.reply("activity.listRecent", {
      items: [],
      nextCursor: null,
      total: null,
    });

    await callServerFn(listRecentActivityFn, { caseId: `  ${testId(10)}  ` });

    expect(orpc.calls("activity.listRecent")).toMatchObject([
      { caseId: testId(10) },
    ]);
  });
});
