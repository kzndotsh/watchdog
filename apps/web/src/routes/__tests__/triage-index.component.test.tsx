// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

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

import { Route } from "@/routes/_protected/triage/index";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

describe("triage index route", () => {
  beforeEach(() => {
    warmTriageQueriesMock.mockClear();
  });

  it("warms triage queries when a case is active", async () => {
    const ensureQueryData = vi
      .fn()
      .mockResolvedValue({ active: ACTIVE, cases: [ACTIVE] });
    const queryClient = { ensureQueryData };
    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({ context: { queryClient } } as never);

    expect(ensureQueryData).toHaveBeenCalledTimes(1);
    expect(warmTriageQueriesMock).toHaveBeenCalledWith(queryClient, ACTIVE.id);
  });

  it("does not warm triage queries without an active case", async () => {
    const ensureQueryData = vi
      .fn()
      .mockResolvedValue({ active: null, cases: [] });
    const queryClient = { ensureQueryData };
    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({ context: { queryClient } } as never);

    expect(warmTriageQueriesMock).not.toHaveBeenCalled();
  });
});
