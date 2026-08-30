import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/shared/hooks/use-live-events", () => ({
  useLiveEvents: vi.fn(),
}));

vi.mock("@/domains/cases/components/case-settings-form", () => ({
  CaseSettingsForm: () => <div>Case settings form</div>,
}));

const useSuspenseQueryMock = vi.hoisted(() => vi.fn());
const useSuspenseQueriesMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) => useSuspenseQueryMock(...args),
    useSuspenseQueries: (options: { queries: unknown[] }) =>
      useSuspenseQueriesMock(options),
  };
});

import { CaseOverviewTab } from "@/domains/cases/components/case-overview-tab";

const CASE: CaseRecord = {
  id: "case-1",
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function renderTab(
  entities: Parameters<typeof CaseOverviewTab>[0]["entities"] = [],
  identifiers: Parameters<typeof CaseOverviewTab>[0]["identifiers"] = []
) {
  useSuspenseQueriesMock.mockReturnValue([
    { data: [] },
    { data: [] },
    { data: [] },
    { data: [] },
  ]);

  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CaseOverviewTab
        caseId={CASE.id}
        caseRow={CASE}
        entities={entities}
        identifiers={identifiers}
      />
    </QueryClientProvider>
  );
}

describe("CaseOverviewTab", () => {
  it("renders stat tiles from entity and identifier counts", () => {
    renderTab(
      [
        {
          id: "ent-1",
          caseId: CASE.id,
          slug: "a",
          name: "A",
          kind: "person",
          summary: null,
          notes: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      []
    );

    expect(
      screen.getByRole("region", { name: "Case stats" })
    ).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Entities")).toBeInTheDocument();
    expect(screen.getByText("Identifiers")).toBeInTheDocument();
  });

  it("shows a blank activity slate when there is no recent activity", () => {
    renderTab();
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
    expect(screen.getByText("Case settings form")).toBeInTheDocument();
  });
});
