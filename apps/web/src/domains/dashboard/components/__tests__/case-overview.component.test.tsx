import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { testCaseId } from "@watchdog/domain/schemas/testing";

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@/domains/dashboard/components/case-overview-tab", () => ({
  CaseOverviewTab: () => <div>Overview tab body</div>,
}));

vi.mock("@/domains/cases/components/delete-case-dialog", () => ({
  DeleteCaseDialog: () => null,
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

vi.mock("@/app/lib/query-invalidation", () => ({
  invalidateAfterCaseSwitch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/domains/cases/lib/active-case", () => ({
  notifyCasesChanged: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

const useQueriesMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

function queryLoaded<T>(data: T) {
  return {
    data,
    isFetched: true,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  };
}

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueries: (options: { queries: unknown[] }) => useQueriesMock(options),
    useMutation: (...args: unknown[]) => useMutationMock(...args),
  };
});

import { CaseOverview } from "@/domains/dashboard/components/case-overview";

const CASE: CaseRecord = {
  id: testCaseId(1),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

const POLICY = {
  restoreWindowDays: 30,
  canManage: true,
  canIncludeBreachCredentials: false,
};

function renderOverview(
  policy: {
    restoreWindowDays: number;
    canManage: boolean;
    canIncludeBreachCredentials: boolean;
  } = POLICY
) {
  useQueriesMock.mockReturnValue([queryLoaded(CASE), queryLoaded(policy)]);
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  });

  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CaseOverview caseId={CASE.id} />
    </QueryClientProvider>
  );
}

describe("CaseOverview", () => {
  it("shows the overview with Export and Delete, and no Set Active: the URL's Case is the Active Case", () => {
    renderOverview();
    expect(screen.getByText("Overview tab body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Set Active" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("disables Delete for a member (the tooltip says why)", () => {
    renderOverview({
      restoreWindowDays: 30,
      canManage: false,
      canIncludeBreachCredentials: false,
    });
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("offers Export with responses only to an owner or admin, and asks the export for raw bodies", async () => {
    // The export probes its URL first (a 202 stops there), so the fetch shows what was asked for.
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("{}", { status: 202 }))
    );
    vi.stubGlobal("fetch", fetchMock);
    renderOverview();
    await userEvent.click(
      screen.getByRole("button", { name: "Export with responses" })
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/cases/${CASE.id}/export.zip?rawBodies=1`,
        { signal: expect.any(AbortSignal) }
      );
    });
    cleanup();

    renderOverview({
      restoreWindowDays: 30,
      canManage: false,
      canIncludeBreachCredentials: false,
    });
    expect(
      screen.queryByRole("button", { name: "Export with responses" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("offers Include breach credentials only when the policy allows it (owner or admin, full mode), and asks the export for them", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("{}", { status: 202 }))
    );
    vi.stubGlobal("fetch", fetchMock);
    renderOverview({
      restoreWindowDays: 30,
      canManage: true,
      canIncludeBreachCredentials: true,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Include breach credentials" })
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/cases/${CASE.id}/export.zip?breachCredentials=1`,
        { signal: expect.any(AbortSignal) }
      );
    });
    cleanup();

    // An owner or admin on an instance that is not in full mode, and a member: no option.
    for (const canManage of [true, false]) {
      renderOverview({
        restoreWindowDays: 30,
        canManage,
        canIncludeBreachCredentials: false,
      });
      expect(
        screen.queryByRole("button", { name: "Include breach credentials" })
      ).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("enables Delete for an owner or admin", () => {
    renderOverview();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });
});
