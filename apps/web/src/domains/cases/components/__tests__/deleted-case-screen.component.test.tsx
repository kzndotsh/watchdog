import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildDeletedCaseRecord,
  buildRestoredCaseRecord,
} from "@/testing/records";
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
  restoreCaseFn: vi.fn(),
  getCasesContextFn: vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  restoreCaseFn: fns.restoreCaseFn,
  getCasesContextFn: fns.getCasesContextFn,
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  getDeletionPolicyFn: vi.fn(),
  getDeletedCaseBySlugFn: vi.fn(),
  listDeletedCasesPageFn: vi.fn(),
}));

import { DeletedCaseScreen } from "@/domains/cases/components/deleted-case-screen";

function renderScreen(
  deleted = buildDeletedCaseRecord({ name: "Alpha Case" })
) {
  const router = createTestRouter();
  const navigate = vi.spyOn(router, "navigate").mockResolvedValue(undefined);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const RouterWrapper = testRouterWrapper(router);
  render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <DeletedCaseScreen deleted={deleted} />
      </SidebarProvider>
    </QueryClientProvider>,
    { wrapper: RouterWrapper }
  );
  return { deleted, navigate, router };
}

describe("DeletedCaseScreen", () => {
  beforeEach(() => {
    fns.restoreCaseFn
      .mockReset()
      .mockResolvedValue(buildRestoredCaseRecord({ name: "Alpha Case" }));
    fns.getCasesContextFn
      .mockReset()
      .mockResolvedValue({ cases: [], active: null });
  });

  it("says when and by whom the Case was deleted, and how long is left", () => {
    const { router } = renderScreen();
    expect(
      screen.getByRole("heading", { name: "Case deleted" })
    ).toBeInTheDocument();
    expect(screen.getByText(/by Ada Owner/)).toBeInTheDocument();
    expect(screen.getByText(/30 days left to restore/)).toBeInTheDocument();
    destroyTestRouter(router);
  });

  it("restores the Case and returns to it", async () => {
    const { deleted, navigate, router } = renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Restore case" }));

    await waitFor(() => {
      expect(fns.restoreCaseFn).toHaveBeenCalledWith({
        data: { caseId: deleted.id },
      });
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/cases/$caseSlug",
          params: { caseSlug: deleted.slug },
        })
      );
    });
    destroyTestRouter(router);
  });

  it("returns to the Case under its new link when the old one was taken", async () => {
    fns.restoreCaseFn.mockResolvedValue(
      buildRestoredCaseRecord({ slug: "alpha-2", previousSlug: "alpha" })
    );
    const { navigate, router } = renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Restore case" }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ params: { caseSlug: "alpha-2" } })
      );
    });
    destroyTestRouter(router);
  });

  it("stays on the screen when the restore is refused", async () => {
    fns.restoreCaseFn.mockRejectedValue(new Error("No"));
    const { navigate, router } = renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Restore case" }));

    await waitFor(() => {
      expect(fns.restoreCaseFn).toHaveBeenCalled();
    });
    expect(navigate).not.toHaveBeenCalled();
    destroyTestRouter(router);
  });

  it("cannot restore once the window has ended, and says why", () => {
    const { router } = renderScreen(buildDeletedCaseRecord({ daysLeft: 0 }));
    expect(screen.getByRole("button", { name: "Restore case" })).toBeDisabled();
    expect(screen.getByText(/Restore window ended/)).toBeInTheDocument();
    destroyTestRouter(router);
  });

  it("cannot restore once a purge has begun", () => {
    const { router } = renderScreen(buildDeletedCaseRecord({ purging: true }));
    expect(screen.getByRole("button", { name: "Restore case" })).toBeDisabled();
    expect(screen.getByText(/Purge in progress/)).toBeInTheDocument();
    destroyTestRouter(router);
  });
});
