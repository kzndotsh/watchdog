// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

vi.mock("@/domains/triage/components/triage", () => ({
  Triage: () => <div>Triage</div>,
}));

const warmTriageQueriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/triage/lib/prefetch-triage", () => ({
  warmTriageQueries: warmTriageQueriesMock,
}));

import { Route } from "@/routes/_protected/cases/$caseSlug/triage";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

const validateSearch = Route.options.validateSearch as {
  parse: (value: unknown) => Record<string, unknown>;
};

describe("triage route", () => {
  beforeEach(() => {
    warmTriageQueriesMock.mockClear();
  });

  it("warms the URL's view of the queue for the Case in the URL", async () => {
    const queryClient = {};
    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({
      context: { queryClient, workCase: ACTIVE },
      location: { search: { status: ["pending"], q: "lead" } },
    } as never);

    expect(warmTriageQueriesMock).toHaveBeenCalledWith(queryClient, ACTIVE.id, {
      status: ["pending"],
      q: "lead",
    });
  });

  it("keeps the list params and the selection, and drops a bad value", () => {
    const proposalId = testId(51);
    expect(
      validateSearch.parse({
        status: ["pending"],
        proposalId,
        sort: "created.asc",
      })
    ).toEqual({ status: ["pending"], proposalId, sort: "created.asc" });
    expect(
      validateSearch.parse({ status: "pending", proposalId: "not-a-uuid" })
    ).toEqual({});
  });
});
