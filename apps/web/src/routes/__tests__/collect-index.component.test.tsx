// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const useSearchMock = vi.hoisted(() => vi.fn(() => ({ id: undefined })));
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

vi.mock("@/domains/collect/components/collect", () => ({
  Collect: () => <div>Collect</div>,
}));

vi.mock("@/shared/layout/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const warmCollectQueriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/collect/lib/prefetch-collect", () => ({
  warmCollectQueries: warmCollectQueriesMock,
}));

import { Route } from "@/routes/_protected/cases/$caseSlug/collect";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

describe("collect route", () => {
  beforeEach(() => {
    warmCollectQueriesMock.mockClear();
  });

  // Triage's loading path: a thin loader, so the shell paints at once and the queue and
  // detail show their skeletons while the lists load (an awaited loader blanks the page).
  it("returns at once and warms the Case's queue lists without waiting for them", () => {
    const queryClient = {};
    const loader = Route.options.loader as (ctx: never) => unknown;

    const returned = loader({
      context: { queryClient, workCase: ACTIVE },
      location: { search: {} },
    } as never);

    expect(returned).toBeUndefined();
    expect(warmCollectQueriesMock).toHaveBeenCalledWith(
      queryClient,
      ACTIVE.id,
      {}
    );
  });

  it("warms the selected row when search id is set", () => {
    const selectedId = testId(99);
    const queryClient = {};
    const loader = Route.options.loader as (ctx: never) => unknown;

    const returned = loader({
      context: { queryClient, workCase: ACTIVE },
      location: { search: { id: selectedId } },
    } as never);

    expect(returned).toBeUndefined();
    expect(warmCollectQueriesMock).toHaveBeenCalledWith(
      queryClient,
      ACTIVE.id,
      { id: selectedId }
    );
  });
});
