// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const useSearchMock = vi.hoisted(() =>
  vi.fn(() => ({ proposalId: undefined, status: undefined }))
);
const useNavigateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    getRouteApi: () => ({
      useSearch: useSearchMock,
      useNavigate: () => useNavigateMock,
    }),
  };
});

vi.mock("@/domains/triage/components/triage", () => ({
  Triage: ({
    proposalId,
    initialStatus,
  }: {
    proposalId?: string;
    initialStatus?: string;
  }) => (
    <div>
      Triage {proposalId ?? "none"} {initialStatus ?? "all"}
    </div>
  ),
}));

vi.mock("@/shared/layout/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

describe("triage index route", () => {
  beforeEach(() => {
    warmTriageQueriesMock.mockClear();
  });

  it("warms triage queries for the Case in the URL", async () => {
    const queryClient = {};
    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({ context: { queryClient, workCase: ACTIVE } } as never);

    expect(warmTriageQueriesMock).toHaveBeenCalledWith(queryClient, ACTIVE.id);
  });

  it("trims padded proposal status in validateSearch", () => {
    const validateSearch = Route.options.validateSearch as {
      parse: (value: unknown) => { status?: string };
    };
    expect(validateSearch.parse({ status: "  pending  " })).toEqual({
      status: "pending",
    });
  });
});
