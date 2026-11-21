import { ORPCError } from "@orpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

vi.mock("@/domains/dashboard/components/case-overview", () => ({
  CaseOverview: ({ caseId }: { caseId: string }) => (
    <div>Case overview {caseId}</div>
  ),
}));

const warmCaseOverviewQueries = vi.hoisted(() => vi.fn());
vi.mock("@/domains/dashboard/lib/prefetch-case-overview", () => ({
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

import {
  LAST_CASE_STORAGE_KEY,
  readLastCaseId,
} from "@/domains/cases/lib/active-case";
import { Route } from "@/routes/_protected/cases/$caseSlug";
import { Route as OverviewRoute } from "@/routes/_protected/cases/$caseSlug/index";
import { procedureDouble } from "@/testing/orpc-client";
import { buildDeletedCaseRecord } from "@/testing/records";
import { callRouteHook } from "@/testing/route-hooks";

const getDeletionPolicyFn = procedureDouble("cases.deletionPolicy");
const getDeletedCaseBySlugFn = procedureDouble("cases.getDeletedBySlug");

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
const beforeLoad = Route.options.beforeLoad;

/** `lookup` answers the Case query (null: the organization cannot see that slug). */
function fakeClient(lookup: unknown) {
  const query = vi.fn(async () => lookup);
  return {
    query,
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    refetchQueries: vi.fn().mockResolvedValue(undefined),
    // No declared list view is cached: every key refetches directly.
    getQueryCache: () => ({ findAll: () => [] }),
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
      cancellableJobs: 0,
      canIncludeBreachCredentials: false,
      canManage: true,
    });
    getDeletedCaseBySlugFn.mockRejectedValue(new ORPCError("NOT_FOUND"));
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
      cancellableJobs: 0,
      canIncludeBreachCredentials: false,
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
      cancellableJobs: 0,
      canIncludeBreachCredentials: false,
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
      cancellableJobs: 0,
      canIncludeBreachCredentials: false,
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

  it("answers not found for a slug the organization cannot see (another organization's Case)", async () => {
    // `cases.getBySlug` searches only the caller's organization's Cases, so a foreign
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
    const queryClient = fakeClient(caseRow);

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

  describe("the last Case entered", () => {
    afterEach(() => {
      window.localStorage.removeItem(LAST_CASE_STORAGE_KEY);
    });

    it("remembers the URL's Case when it is entered, with no server write", async () => {
      const queryClient = fakeClient(caseRow);

      await expect(
        callRouteHook(beforeLoad, {
          context: { queryClient },
          params: { caseSlug: "alpha" },
          preload: false,
        })
      ).resolves.toEqual({ workCase: caseRow });

      expect(readLastCaseId()).toBe(CASE_ID);
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });

    it("does not remember it on an intent preload", async () => {
      await expect(
        callRouteHook(beforeLoad, {
          context: { queryClient: fakeClient(caseRow) },
          params: { caseSlug: "alpha" },
          preload: true,
        })
      ).resolves.toEqual({ workCase: caseRow });

      expect(readLastCaseId()).toBeNull();
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
