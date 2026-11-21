import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "#ui/components/sidebar";
import {
  createTestRouter,
  destroyTestRouter,
  testRouterWrapper,
} from "@/testing/test-router";

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { DeletedCasesPage } from "@/domains/cases/components/deleted-cases-page";
import { procedureDouble } from "@/testing/orpc-client";

const fns = {
  getDeletionPolicyFn: procedureDouble("cases.deletionPolicy"),
  listDeletedCasesPageFn: procedureDouble("cases.listDeleted"),
  getCasesContextFn: procedureDouble("cases.list"),
};

function renderPage() {
  const router = createTestRouter();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const RouterWrapper = testRouterWrapper(router);
  render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <DeletedCasesPage search={{}} onSearchChange={vi.fn()} />
      </SidebarProvider>
    </QueryClientProvider>,
    { wrapper: RouterWrapper }
  );
  return router;
}

describe("DeletedCasesPage", () => {
  beforeEach(() => {
    fns.listDeletedCasesPageFn.mockReset().mockResolvedValue({
      items: [],
      nextCursor: null,
      total: { count: 0, isCapped: false },
    });
    fns.getCasesContextFn.mockReset().mockResolvedValue({
      items: [],
      nextCursor: null,
      total: { count: 0, isCapped: false },
    });
  });

  it("shows an owner or admin the Deleted Cases list", async () => {
    fns.getDeletionPolicyFn.mockReset().mockResolvedValue({
      restoreWindowDays: 30,
      cancellableJobs: 0,
      canManage: true,
      canIncludeBreachCredentials: false,
    });
    const router = renderPage();

    expect(await screen.findByText("No Deleted Cases Yet")).toBeInTheDocument();
    expect(fns.listDeletedCasesPageFn).toHaveBeenCalled();
    destroyTestRouter(router);
  });

  it("tells a member that only owners and admins can see deleted Cases, and never asks for the list", async () => {
    fns.getDeletionPolicyFn.mockReset().mockResolvedValue({
      restoreWindowDays: 30,
      cancellableJobs: 0,
      canManage: false,
      canIncludeBreachCredentials: false,
    });
    const router = renderPage();

    expect(
      await screen.findByText("Only owners and admins can see deleted Cases.")
    ).toBeInTheDocument();
    expect(fns.listDeletedCasesPageFn).not.toHaveBeenCalled();
    destroyTestRouter(router);
  });

  it("shows a loading state until the caller's role is known", async () => {
    let finish: () => void = () => undefined;
    fns.getDeletionPolicyFn.mockReset().mockReturnValue(
      new Promise((resolve) => {
        finish = () => {
          resolve({
            restoreWindowDays: 30,
            cancellableJobs: 0,
            canManage: true,
            canIncludeBreachCredentials: false,
          });
        };
      })
    );
    const router = renderPage();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    finish();
    expect(await screen.findByText("No Deleted Cases Yet")).toBeInTheDocument();
    destroyTestRouter(router);
  });
});
