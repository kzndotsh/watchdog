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
  Collect: ({ urlId }: { urlId?: string }) => (
    <div>Collect {urlId ?? "none"}</div>
  ),
}));

vi.mock("@/shared/layout/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ensureCollectQueueQueriesMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined)
);
const ensureCollectJobDetailWhenSelectedMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined)
);
const ensureCollectEvidenceBlobWhenSelectedMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined)
);
const warmCollectCatalogQueriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/collect/lib/prefetch-collect", () => ({
  ensureCollectQueueQueries: ensureCollectQueueQueriesMock,
  ensureCollectJobDetailWhenSelected: ensureCollectJobDetailWhenSelectedMock,
  ensureCollectEvidenceBlobWhenSelected:
    ensureCollectEvidenceBlobWhenSelectedMock,
  warmCollectCatalogQueries: warmCollectCatalogQueriesMock,
}));

import { Route } from "@/routes/_protected/cases/$caseSlug/collect";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

describe("collect route", () => {
  beforeEach(() => {
    ensureCollectQueueQueriesMock.mockClear();
    ensureCollectJobDetailWhenSelectedMock.mockClear();
    ensureCollectEvidenceBlobWhenSelectedMock.mockClear();
    warmCollectCatalogQueriesMock.mockClear();
  });

  it("awaits queue lists before catalog warm for the Case in the URL", async () => {
    const queryClient = {};
    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({
      context: { queryClient, workCase: ACTIVE },
      deps: { id: undefined },
    } as never);

    expect(ensureCollectQueueQueriesMock).toHaveBeenCalledWith(
      queryClient,
      ACTIVE.id
    );
    expect(ensureCollectJobDetailWhenSelectedMock).not.toHaveBeenCalled();
    expect(warmCollectCatalogQueriesMock).toHaveBeenCalledWith(
      queryClient,
      ACTIVE.id
    );
  });

  it("awaits job detail when search id is set", async () => {
    const selectedId = testId(99);
    const queryClient = {};
    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({
      context: { queryClient, workCase: ACTIVE },
      deps: { id: selectedId },
    } as never);

    expect(ensureCollectJobDetailWhenSelectedMock).toHaveBeenCalledWith(
      queryClient,
      ACTIVE.id,
      selectedId
    );
    expect(ensureCollectEvidenceBlobWhenSelectedMock).toHaveBeenCalledWith(
      queryClient,
      ACTIVE.id,
      selectedId
    );
  });
});
