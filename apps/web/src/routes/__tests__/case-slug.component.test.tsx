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
      useLoaderData: () => ({
        id: testId(10),
        slug: "alpha",
        name: "Alpha",
      }),
    }),
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
    redirect: (options: unknown) => {
      throw options;
    },
    notFound: () => {
      throw { notFound: true };
    },
  };
});

vi.mock("@/domains/cases/components/case-overview", () => ({
  CaseOverview: ({ caseId }: { caseId: string }) => (
    <div>Case overview {caseId}</div>
  ),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  setActiveCaseIdFn: vi.fn(),
}));

vi.mock("@/domains/cases/lib/prefetch-case-overview", () => ({
  warmCaseOverviewQueries: vi.fn(),
}));

vi.mock("@/shared/layout/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

import { Route } from "@/routes/_protected/cases/$caseSlug";

const CASE_ID = testId(10);
const notFoundProps = {
  isNotFound: true as const,
  routeId: "/_protected/cases/$caseSlug" as const,
};

describe("case slug route", () => {
  it("renders a not-found page for unknown slugs", () => {
    useParamsMock.mockReturnValue({ caseSlug: "missing" });
    const NotFound = Route.options.notFoundComponent!;
    render(<NotFound {...notFoundProps} />);

    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Cases" })).toHaveAttribute(
      "href",
      "/cases"
    );
  });

  it("redirects legacy uuid paths to slug routes", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ id: CASE_ID, slug: "alpha", name: "Alpha" });

    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await expect(
      loader({
        context: { queryClient: { query } },
        params: { caseSlug: CASE_ID },
        deps: {},
      } as never)
    ).rejects.toEqual(
      expect.objectContaining({
        to: "/cases/$caseSlug",
        params: { caseSlug: "alpha" },
        replace: true,
      })
    );
  });

  it("renders the case overview for loader data", () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText(`Case overview ${CASE_ID}`)).toBeInTheDocument();
  });
});
