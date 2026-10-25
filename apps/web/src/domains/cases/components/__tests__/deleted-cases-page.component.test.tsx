import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTestRouter,
  destroyTestRouter,
  testRouterWrapper,
} from "@/testing/test-router";
import { SidebarProvider } from "@watchdog/ui/components/sidebar";

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

const fns = vi.hoisted(() => ({
  getDeletionPolicyFn: vi.fn(),
  listDeletedCasesFn: vi.fn(),
  getCasesContextFn: vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  getDeletionPolicyFn: fns.getDeletionPolicyFn,
  listDeletedCasesFn: fns.listDeletedCasesFn,
  getCasesContextFn: fns.getCasesContextFn,
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  getDeletedCaseBySlugFn: vi.fn(),
  restoreCaseFn: vi.fn(),
  purgeCaseFn: vi.fn(),
}));

import { DeletedCasesPage } from "@/domains/cases/components/deleted-cases-page";

function renderPage() {
  const router = createTestRouter();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const RouterWrapper = testRouterWrapper(router);
  render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <DeletedCasesPage />
      </SidebarProvider>
    </QueryClientProvider>,
    { wrapper: RouterWrapper }
  );
  return router;
}

describe("DeletedCasesPage", () => {
  beforeEach(() => {
    fns.listDeletedCasesFn
      .mockReset()
      .mockResolvedValue({ items: [], nextCursor: null });
    fns.getCasesContextFn
      .mockReset()
      .mockResolvedValue({ cases: [], active: null });
  });

  it("shows an owner or admin the Deleted Cases list", async () => {
    fns.getDeletionPolicyFn.mockReset().mockResolvedValue({
      restoreWindowDays: 30,
      canManage: true,
      canIncludeBreachCredentials: false,
    });
    const router = renderPage();

    expect(await screen.findByText("No Deleted Cases")).toBeInTheDocument();
    expect(fns.listDeletedCasesFn).toHaveBeenCalled();
    destroyTestRouter(router);
  });

  it("tells a member that only owners and admins can see deleted Cases, and never asks for the list", async () => {
    fns.getDeletionPolicyFn.mockReset().mockResolvedValue({
      restoreWindowDays: 30,
      canManage: false,
      canIncludeBreachCredentials: false,
    });
    const router = renderPage();

    expect(
      await screen.findByText("Only owners and admins can see deleted Cases.")
    ).toBeInTheDocument();
    expect(fns.listDeletedCasesFn).not.toHaveBeenCalled();
    destroyTestRouter(router);
  });

  it("shows a loading state until the caller's role is known", async () => {
    let finish: () => void = () => undefined;
    fns.getDeletionPolicyFn.mockReset().mockReturnValue(
      new Promise((resolve) => {
        finish = () => {
          resolve({
            restoreWindowDays: 30,
            canManage: true,
            canIncludeBreachCredentials: false,
          });
        };
      })
    );
    const router = renderPage();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    finish();
    expect(await screen.findByText("No Deleted Cases")).toBeInTheDocument();
    destroyTestRouter(router);
  });
});
