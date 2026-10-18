import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { testCaseId } from "@watchdog/schemas/testing";

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    ...rest
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => (
    <a href="/settings?tab=deleted-cases" className={rest.className}>
      {children}
    </a>
  ),
}));

const fns = vi.hoisted(() => ({
  getCasesContextFn: vi.fn(),
  getDeletionPolicyFn: vi.fn(),
  listJobsFn: vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: fns.getCasesContextFn,
  getDeletionPolicyFn: fns.getDeletionPolicyFn,
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  getDeletedCaseBySlugFn: vi.fn(),
  listDeletedCasesFn: vi.fn(),
  createCaseFn: vi.fn(),
  deleteCaseFn: vi.fn(),
  restoreCaseFn: vi.fn(),
  setActiveCaseIdFn: vi.fn(),
}));

vi.mock("@/domains/jobs/jobs.functions", () => ({
  listJobsFn: fns.listJobsFn,
  getJobFn: vi.fn(),
  listCapabilitiesFn: vi.fn(),
  listPlaybooksFn: vi.fn(),
}));

import { CaseList } from "@/domains/cases/components/case-list";

const CASE_A: CaseRecord = {
  id: testCaseId(1),
  slug: "alpha",
  name: "Alpha",
  description: "First case",
  allowThirdPartyEgress: false,
};

const CASE_B: CaseRecord = {
  id: testCaseId(2),
  slug: "beta",
  name: "Beta",
  description: null,
  allowThirdPartyEgress: true,
};

function renderCaseList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CaseList />
    </QueryClientProvider>
  );
}

describe("CaseList", () => {
  beforeEach(() => {
    fns.getCasesContextFn
      .mockReset()
      .mockResolvedValue({ cases: [CASE_A, CASE_B], active: CASE_A });
    fns.getDeletionPolicyFn
      .mockReset()
      .mockResolvedValue({ restoreWindowDays: 30, canManage: true });
    fns.listJobsFn.mockReset().mockResolvedValue([]);
  });

  it("renders case cards with the active case marked", async () => {
    renderCaseList();

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("First case")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Open" }).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByRole("button", { name: "Select" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Active" })
    ).not.toBeInTheDocument();
  });

  it("shows a no-results empty state when search matches nothing", async () => {
    fns.getCasesContextFn.mockResolvedValue({
      cases: [CASE_A],
      active: CASE_A,
    });
    renderCaseList();
    await screen.findByText("Alpha");

    await userEvent.type(
      screen.getByRole("textbox", { name: "Search cases" }),
      "missing"
    );

    expect(screen.getByText(/No cases Match/i)).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search cases" })).toHaveValue(
      "missing"
    );
  });

  it("offers Delete and the Deleted Cases link to an owner or admin", async () => {
    renderCaseList();
    await screen.findByText("Alpha");

    expect(
      await screen.findByRole("link", { name: /Deleted Cases/ })
    ).toBeInTheDocument();
    const [firstMenu] = screen.getAllByRole("button", { name: "Case actions" });
    await userEvent.click(firstMenu!);
    expect(
      await screen.findByRole("menuitem", { name: "Delete" })
    ).toBeInTheDocument();
  });

  it("hides Delete and the Deleted Cases link from a member", async () => {
    fns.getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canManage: false,
    });
    renderCaseList();
    await screen.findByText("Alpha");
    await vi.waitFor(() => {
      expect(fns.getDeletionPolicyFn).toHaveBeenCalled();
    });

    expect(
      screen.queryByRole("link", { name: /Deleted Cases/ })
    ).not.toBeInTheDocument();
    const [firstMenu] = screen.getAllByRole("button", { name: "Case actions" });
    await userEvent.click(firstMenu!);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Open" })).toBeVisible();
    expect(
      within(menu).queryByRole("menuitem", { name: "Delete" })
    ).not.toBeInTheDocument();
  });
});
