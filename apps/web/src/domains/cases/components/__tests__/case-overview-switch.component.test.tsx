import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord, CasesContext } from "@/domains/cases/types";
import { Toaster } from "@/shared/ui/toast";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@/domains/cases/components/case-overview-tab", () => ({
  CaseOverviewTab: () => <div>Overview tab body</div>,
}));

vi.mock("@/domains/cases/components/delete-case-dialog", () => ({
  DeleteCaseDialog: () => null,
}));

vi.mock("@/domains/entities/queries", () => ({
  entitiesListQuery: (caseId: string) => ({
    queryKey: ["entities", caseId],
    queryFn: async () => [],
  }),
}));

vi.mock("@/domains/entities/identifiers/queries", () => ({
  identifiersForCaseQuery: (caseId: string) => ({
    queryKey: ["identifiers", caseId],
    queryFn: async () => [],
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

const cases = vi.hoisted(() => ({
  alpha: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    slug: "alpha",
    name: "Alpha",
    description: null,
    allowThirdPartyEgress: false,
  } as CaseRecord,
  beta: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    slug: "beta",
    name: "Beta",
    description: null,
    allowThirdPartyEgress: false,
  } as CaseRecord,
}));

const setActiveCaseIdFn = vi.hoisted(() => vi.fn());
vi.mock("@/domains/cases/cases.functions", () => ({
  getCaseByIdFn: vi.fn(async () => cases.beta),
  getCasesContextFn: vi.fn(async (): Promise<CasesContext> => ({
    cases: [cases.alpha, cases.beta],
    active: cases.alpha,
  })),
  setActiveCaseIdFn,
  updateCaseFn: vi.fn(),
}));

import { CaseOverview } from "@/domains/cases/components/case-overview";

function renderOverview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Toaster />
      <CaseOverview caseId={cases.beta.id} />
    </QueryClientProvider>
  );
}

describe("CaseOverview Set Active", () => {
  it("shows the shared switch failure copy when Set Active fails", async () => {
    setActiveCaseIdFn.mockRejectedValueOnce(
      Object.assign(new Error("Internal server error"), { status: 500 })
    );
    renderOverview();

    await userEvent.click(
      await screen.findByRole("button", { name: "Set Active" })
    );

    expect(
      await screen.findByText("Couldn't switch Case. Try again.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Couldn't set Active Case")).toBeNull();
    expect(screen.queryByText("Active Case set")).toBeNull();
  });

  it("confirms with Active Case set and marks the Case Active", async () => {
    setActiveCaseIdFn.mockResolvedValueOnce(cases.beta.id);
    renderOverview();

    await userEvent.click(
      await screen.findByRole("button", { name: "Set Active" })
    );

    expect(await screen.findByText("Active Case set")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Set Active" })
      ).not.toBeInTheDocument();
    });
  });
});
