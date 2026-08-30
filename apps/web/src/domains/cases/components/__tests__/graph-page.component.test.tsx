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

const useSuspenseQueriesMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQueries: (options: { queries: unknown[] }) =>
      useSuspenseQueriesMock(options),
  };
});

vi.mock("@/domains/cases/components/case-graph/case-graph-canvas", () => ({
  CaseGraphCanvas: () => <div>Graph canvas</div>,
}));

import { GraphPage } from "@/domains/cases/components/graph-page";
import { casesContextQuery } from "@/domains/cases/queries";
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
    useSuspenseQueriesMock.mockReturnValue([
      { data: { cases: [], active: null } },
    ]);

    renderGraphPage();
    expect(screen.getByRole("link", { name: "Select a case" })).toHaveAttribute(
      "href",
      "/cases"
    );
    expect(screen.queryByText("Graph canvas")).not.toBeInTheDocument();
    expect(useSuspenseQueriesMock).toHaveBeenCalled();
  });

  it("renders the graph canvas when an active case exists", () => {
    useSuspenseQueriesMock.mockImplementation(({ queries }) => {
      const firstKey = (queries[0] as { queryKey: readonly unknown[] })
        .queryKey;
      if (firstKey[0] === "cases") {
        return [{ data: { cases: [CASE], active: CASE } }];
      }
      if (firstKey[0] === "entities") {
        return [{ data: [] }, { data: [] }];
      }
      throw new Error(`Unexpected query: ${String(firstKey[0])}`);
    });

    renderGraphPage();
    expect(screen.getByText("Graph canvas")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Select a case" })
    ).not.toBeInTheDocument();

    const queryKeys = useSuspenseQueriesMock.mock.calls.flatMap(([options]) =>
      (options as { queries: { queryKey: readonly unknown[] }[] }).queries.map(
        (query) => query.queryKey
      )
    );
    expect(queryKeys).toContainEqual(casesContextQuery().queryKey);
    expect(queryKeys).toContainEqual(entitiesListQuery(CASE.id).queryKey);
    expect(queryKeys).toContainEqual(edgesForCaseQuery(CASE.id).queryKey);
  });
});
