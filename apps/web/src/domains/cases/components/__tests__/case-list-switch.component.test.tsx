import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
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
  createCaseFn: vi.fn(),
  deleteCaseFn: vi.fn(),
  getCasesContextFn: vi.fn(async (): Promise<CasesContext> => ({
    cases: [cases.alpha, cases.beta],
    active: cases.alpha,
  })),
  setActiveCaseIdFn,
}));

import { CaseList } from "@/domains/cases/components/case-list";

function renderCaseList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Toaster />
      <CaseList />
    </QueryClientProvider>
  );
}

async function openBeta() {
  await screen.findByText("Beta");
  // Cards sort by name: Alpha first, Beta second.
  const opens = screen.getAllByRole("button", { name: "Open" });
  await userEvent.click(opens[1]!);
}

describe("CaseList switching", () => {
  it("shows the shared switch failure copy and stays on the list when Open fails", async () => {
    setActiveCaseIdFn.mockRejectedValueOnce(
      Object.assign(new Error("Internal server error"), { status: 500 })
    );
    renderCaseList();

    await openBeta();

    expect(
      await screen.findByText("Couldn't switch Case. Try again.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Failed to (switch|open) case/)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("switches then opens the Case Overview when Open succeeds", async () => {
    navigate.mockClear();
    setActiveCaseIdFn.mockResolvedValueOnce(cases.beta.id);
    renderCaseList();

    await openBeta();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/cases/$caseSlug",
        params: { caseSlug: "beta" },
      });
    });
    expect(within(document.body).queryByText(/Couldn't/)).toBeNull();
  });
});
