import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const useParamsMock = vi.hoisted(() => vi.fn(() => ({ caseSlug: "missing" })));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    getRouteApi: () => ({
      useParams: useParamsMock,
      useRouteContext: () => ({
        workCase: { id: testId(10), slug: "alpha", name: "Alpha" },
      }),
    }),
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
    useNavigate: () => vi.fn(),
    redirect: (options: unknown) => {
      throw options;
    },
    notFound: () => {
      throw { isNotFound: true };
    },
  };
});

const healActiveCaseFn = vi.hoisted(() =>
  vi.fn(async (_input?: unknown) => ({ changed: false }))
);
const getDeletionPolicyFn = vi.hoisted(() => vi.fn());
const getDeletedCaseBySlugFn = vi.hoisted(() => vi.fn());
vi.mock("@/domains/cases/cases.functions", () => ({
  healActiveCaseFn,
  getDeletionPolicyFn,
  getDeletedCaseBySlugFn,
  restoreCaseFn: vi.fn(),
}));

vi.mock("@/domains/cases/components/case-overview", () => ({
  CaseOverview: ({ caseId }: { caseId: string }) => (
    <div>Case overview {caseId}</div>
  ),
}));

const warmCaseOverviewQueries = vi.hoisted(() => vi.fn());
vi.mock("@/domains/cases/lib/prefetch-case-overview", () => ({
  warmCaseOverviewQueries,
}));

vi.mock("@/shared/layout/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/layout/page-header", () => ({
  PageHeader: ({
    current,
    description,
  }: {
    current?: string;
    description?: React.ReactNode;
  }) => (
    <div>
      <h1>{current}</h1>
      <div>{description}</div>
    </div>
  ),
}));

import { bumpActiveCaseHealEpoch } from "@/domains/cases/lib/active-case";
import { Route } from "@/routes/_protected/cases/$caseSlug";
import { Route as OverviewRoute } from "@/routes/_protected/cases/$caseSlug/index";
import { buildDeletedCaseRecord } from "@/testing/records";
import { callRouteHook } from "@/testing/route-hooks";

const CASE_ID = testId(10);
const notFoundProps = {
  isNotFound: true as const,
  routeId: "/_protected/cases/$caseSlug" as const,
};

const caseRow = {
  id: CASE_ID,
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};
const OTHER_ID = testId(11);

const beforeLoad = Route.options.beforeLoad;

/** `lookup` answers the Case query (null: the organization cannot see that slug). */
function fakeClient(lookup: unknown, activeId: string | null = OTHER_ID) {
  const query = vi.fn(async (options: { queryKey: readonly string[] }) =>
    options.queryKey[1] === "context"
      ? { cases: [], active: activeId ? { id: activeId } : null }
      : lookup
  );
  return {
    query,
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    refetchQueries: vi.fn().mockResolvedValue(undefined),
    setQueryData: vi.fn(),
  };
}

describe("case slug route (the Case segment of Work URLs)", () => {
  function renderNotFound() {
    const NotFound = Route.options.notFoundComponent!;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <NotFound {...notFoundProps} />
      </QueryClientProvider>
    );
  }

  it("renders a not-found page for unknown slugs", async () => {
    useParamsMock.mockReturnValue({ caseSlug: "missing" });
    getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canManage: true,
    });
    getDeletedCaseBySlugFn.mockResolvedValue(null);
    renderNotFound();

    expect(
      await screen.findByRole("heading", { name: "Case not found" })
    ).toBeInTheDocument();
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Cases" })).toHaveAttribute(
      "href",
      "/cases"
    );
  });

  it("shows an owner or admin the deleted-Case screen with Restore", async () => {
    useParamsMock.mockReturnValue({ caseSlug: "alpha" });
    getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canManage: true,
    });
    getDeletedCaseBySlugFn.mockResolvedValue(
      buildDeletedCaseRecord({ slug: "alpha", deletedByName: "Ada Owner" })
    );
    renderNotFound();

    expect(
      await screen.findByRole("heading", { name: "Case deleted" })
    ).toBeInTheDocument();
    expect(screen.getByText(/by Ada Owner/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restore case" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Case not found" })
    ).not.toBeInTheDocument();
  });

  it("shows an owner the ordinary not-found screen at once for a slug that cannot name a Case", async () => {
    useParamsMock.mockReturnValue({ caseSlug: "!!!" });
    getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canManage: true,
    });
    getDeletedCaseBySlugFn.mockClear();
    renderNotFound();

    expect(
      await screen.findByRole("heading", { name: "Case not found" })
    ).toBeInTheDocument();
    expect(getDeletedCaseBySlugFn).not.toHaveBeenCalled();
  });

  it("shows a member the ordinary not-found screen and never asks for the deleted Case", async () => {
    useParamsMock.mockReturnValue({ caseSlug: "alpha" });
    getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canManage: false,
    });
    getDeletedCaseBySlugFn.mockClear();
    renderNotFound();

    expect(
      await screen.findByRole("heading", { name: "Case not found" })
    ).toBeInTheDocument();
    expect(getDeletedCaseBySlugFn).not.toHaveBeenCalled();
    expect(screen.queryByText(/deleted/i)).not.toBeInTheDocument();
  });

  it("is a layout: it renders the screens of the Case through the outlet", () => {
    expect(Route.options.component).toBeDefined();
  });

  it("answers not found for a slug the organization cannot see (another organization's Case)", async () => {
    // `getCaseBySlugFn` searches only the caller's organization's Cases, so a foreign
    // Case's slug looks up as null: the same answer as a slug that never existed.
    const queryClient = fakeClient(null);

    await expect(
      callRouteHook(beforeLoad, {
        context: { queryClient },
        params: { caseSlug: "their-case" },
        preload: false,
      })
    ).rejects.toEqual(expect.objectContaining({ isNotFound: true }));
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it("answers not found for a blank slug", async () => {
    await expect(
      callRouteHook(beforeLoad, {
        context: { queryClient: fakeClient(caseRow) },
        params: { caseSlug: "   " },
        preload: false,
      })
    ).rejects.toEqual(expect.objectContaining({ isNotFound: true }));
  });

  it("hands the Case it found to every child as route context", async () => {
    const queryClient = fakeClient(caseRow, CASE_ID);

    await expect(
      callRouteHook(beforeLoad, {
        context: { queryClient },
        params: { caseSlug: "alpha" },
        preload: false,
      })
    ).resolves.toEqual({ workCase: caseRow });
  });

  it("reads a Case id in the slug position as a slug: it is not found, never a redirect", async () => {
    // Only slugs name a Case in a URL, so a `/cases/<uuid>` link looks up as an unknown slug.
    const queryClient = fakeClient(null);

    await expect(
      callRouteHook(beforeLoad, {
        context: { queryClient },
        params: { caseSlug: CASE_ID },
        preload: false,
      })
    ).rejects.toEqual(expect.objectContaining({ isNotFound: true }));
  });

  describe("cookie healing", () => {
    function run(extra: Record<string, unknown> = {}, activeId = OTHER_ID) {
      const queryClient = fakeClient(caseRow, activeId);
      return {
        queryClient,
        result: callRouteHook(beforeLoad, {
          context: { queryClient },
          params: { caseSlug: "alpha" },
          preload: false,
          ...extra,
        }),
      };
    }

    it("asks the server to heal, carrying the Active Case it observed", async () => {
      healActiveCaseFn.mockClear();
      healActiveCaseFn.mockResolvedValueOnce({ changed: true });
      const { result, queryClient } = run();

      await expect(result).resolves.toEqual({ workCase: caseRow });

      expect(healActiveCaseFn).toHaveBeenCalledWith({
        data: { caseId: CASE_ID, expectedActiveCaseId: OTHER_ID },
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalled();
    });

    it("sends null as the expected Active Case when none was observed", async () => {
      healActiveCaseFn.mockClear();
      healActiveCaseFn.mockResolvedValueOnce({ changed: true });
      const queryClient = fakeClient(caseRow, null);

      await callRouteHook(beforeLoad, {
        context: { queryClient },
        params: { caseSlug: "alpha" },
        preload: false,
      });

      expect(healActiveCaseFn).toHaveBeenCalledWith({
        data: { caseId: CASE_ID, expectedActiveCaseId: null },
      });
    });

    it("skips the server call when the route's Case is already the observed Active Case", async () => {
      healActiveCaseFn.mockClear();
      const { result, queryClient } = run({}, CASE_ID);

      await result;

      expect(healActiveCaseFn).not.toHaveBeenCalled();
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });

    it("leaves the caches alone when the server did not change the cookie", async () => {
      healActiveCaseFn.mockResolvedValueOnce({ changed: false });
      const { result, queryClient } = run();

      await result;

      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });

    it("does not finalize or invalidate when a newer switch bumped the epoch during the heal", async () => {
      let release: (value: { changed: boolean }) => void = () => {};
      healActiveCaseFn.mockImplementationOnce(
        () =>
          new Promise<{ changed: boolean }>((resolve) => {
            release = resolve;
          })
      );
      const { result, queryClient } = run();
      await vi.waitFor(() => {
        expect(healActiveCaseFn).toHaveBeenCalled();
      });

      // The user switched Case via useSelectActiveCase.
      bumpActiveCaseHealEpoch();
      release({ changed: true });
      await result;

      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
      expect(queryClient.setQueryData).not.toHaveBeenCalledWith(
        ["cases", "context"],
        expect.anything()
      );
    });

    it("does not call the server when a switch already bumped the epoch before the heal", async () => {
      healActiveCaseFn.mockClear();
      const { result, queryClient } = run();
      bumpActiveCaseHealEpoch();
      await result;

      expect(healActiveCaseFn).not.toHaveBeenCalled();
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });

    it("does not heal on an intent preload", async () => {
      healActiveCaseFn.mockClear();
      const { result } = run({ preload: true });

      await expect(result).resolves.toEqual({ workCase: caseRow });

      expect(healActiveCaseFn).not.toHaveBeenCalled();
    });
  });
});

describe("case overview route (/cases/$caseSlug)", () => {
  const overviewLoader = OverviewRoute.options.loader;

  it("renders the overview of the Case in the URL", () => {
    const Page = OverviewRoute.options.component!;
    render(<Page />);
    expect(screen.getByText(`Case overview ${CASE_ID}`)).toBeInTheDocument();
  });

  it("warms the overview queries for that Case", () => {
    warmCaseOverviewQueries.mockClear();
    const queryClient = {};

    callRouteHook(overviewLoader, {
      context: { queryClient, workCase: caseRow },
      params: { caseSlug: "alpha" },
    });

    expect(warmCaseOverviewQueries).toHaveBeenCalledWith(queryClient, CASE_ID);
  });

  it("has no tab search: an old ?tab=graph link renders the overview, never a redirect", () => {
    warmCaseOverviewQueries.mockClear();

    expect(OverviewRoute.options.validateSearch).toBeUndefined();
    expect(() =>
      callRouteHook(overviewLoader, {
        context: { queryClient: {}, workCase: caseRow },
        params: { caseSlug: "alpha" },
      })
    ).not.toThrow();
    expect(warmCaseOverviewQueries).toHaveBeenCalledTimes(1);
  });
});
