import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@/shared/ui/shadcn/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

const useCasesContextMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());

function mockCasesContextLoaded(
  active: CaseRecord | null,
  cases: CaseRecord[] = active ? [active] : []
) {
  useCasesContextMock.mockReturnValue({
    casesCtx: { cases, active },
    cases,
    active,
    pending: false,
    loadError: null,
    retry: vi.fn(),
    placeholder: false,
  });
}

vi.mock("@/domains/cases/hooks/use-cases-context", () => ({
  useCasesContext: () => useCasesContextMock(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

vi.mock("@/domains/cases/components/case-graph/case-graph-canvas", () => ({
  CaseGraphCanvas: () => <div>Graph canvas</div>,
}));

vi.mock("@/shared/hooks/use-live-events", () => ({
  useLiveEvents: vi.fn(),
}));

import { GraphPage } from "@/domains/cases/components/graph-page";
import type { CaseRecord } from "@/domains/cases/types";
import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import { entitiesListQuery } from "@/domains/entities/queries";

const CASE: CaseRecord = {
  id: "case-1",
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function mockGraphQueries(opts?: {
  entitiesError?: boolean;
  edgesError?: boolean;
}) {
  useQueryMock
    .mockReturnValueOnce({
      data: opts?.entitiesError ? undefined : [],
      isFetched: true,
      isLoading: false,
      isError: opts?.entitiesError ?? false,
      error: opts?.entitiesError ? new Error("entities failed") : undefined,
      isPlaceholderData: false,
      refetch: vi.fn(),
    })
    .mockReturnValueOnce({
      data: opts?.edgesError ? undefined : [],
      isFetched: true,
      isLoading: false,
      isError: opts?.edgesError ?? false,
      error: opts?.edgesError ? new Error("edges failed") : undefined,
      isPlaceholderData: false,
      refetch: vi.fn(),
    });
}

function renderGraphPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <GraphPage />
    </QueryClientProvider>
  );
}

describe("GraphPage", () => {
  it("prompts users to go to Cases when no active case is selected", () => {
    mockCasesContextLoaded(null);

    renderGraphPage();
    expect(screen.getByRole("link", { name: "Select a case" })).toHaveAttribute(
      "href",
      "/cases"
    );
    expect(screen.queryByText("Graph canvas")).not.toBeInTheDocument();
    expect(useCasesContextMock).toHaveBeenCalled();
  });

  it("renders the graph canvas when an active case exists", () => {
    mockCasesContextLoaded(CASE);
    mockGraphQueries();

    renderGraphPage();
    expect(screen.getByText("Graph canvas")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Select a case" })
    ).not.toBeInTheDocument();

    expect(useCasesContextMock).toHaveBeenCalled();
    const queryKeys = useQueryMock.mock.calls.map(
      ([query]) => (query as { queryKey: readonly unknown[] }).queryKey
    );
    expect(queryKeys).toContainEqual(entitiesListQuery(CASE.id).queryKey);
    expect(queryKeys).toContainEqual(edgesForCaseQuery(CASE.id).queryKey);
  });

  it("shows a retryable error when graph queries fail", () => {
    mockCasesContextLoaded(CASE);
    mockGraphQueries({ entitiesError: true });

    renderGraphPage();
    expect(screen.getByText("entities failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("Graph canvas")).not.toBeInTheDocument();
  });
});
