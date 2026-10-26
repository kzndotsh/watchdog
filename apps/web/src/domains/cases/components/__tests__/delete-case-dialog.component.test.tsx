import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { testCaseId } from "@watchdog/schemas/testing";

const fns = vi.hoisted(() => ({
  deleteCaseFn: vi.fn(),
  getDeletionPolicyFn: vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  deleteCaseFn: fns.deleteCaseFn,
  getDeletionPolicyFn: fns.getDeletionPolicyFn,
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  getDeletedCaseBySlugFn: vi.fn(),
  listDeletedCasesPageFn: vi.fn(),
}));

import { DeleteCaseDialog } from "@/domains/cases/components/delete-case-dialog";

const CASE: CaseRecord = {
  id: testCaseId(1),
  slug: "alpha",
  name: "Alpha Case",
  description: null,
  allowedEgress: ["local", "target"],
};

function renderDialog(onDeleted = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <DeleteCaseDialog
        caseRow={CASE}
        open
        onOpenChange={vi.fn()}
        onDeleted={onDeleted}
      />
    </QueryClientProvider>
  );
  return { onDeleted };
}

describe("DeleteCaseDialog", () => {
  beforeEach(() => {
    fns.deleteCaseFn.mockReset().mockResolvedValue(undefined);
    fns.getDeletionPolicyFn.mockReset().mockResolvedValue({
      restoreWindowDays: 30,
      canIncludeBreachCredentials: false,
      canManage: true,
      cancellableJobs: 0,
    });
  });

  it("says the Case moves to Deleted Cases and can be restored for the configured window", async () => {
    renderDialog();

    expect(
      screen.getByRole("heading", { name: "Delete case" })
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/can restore it for 30 days/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\u201CAlpha Case\u201D moves to Deleted Cases/)
    ).toBeInTheDocument();
    // Restorable: no "cannot be undone" band and no type-the-name gate.
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("follows the configured window", async () => {
    fns.getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 7,
      canIncludeBreachCredentials: false,
      canManage: true,
      cancellableJobs: 0,
    });
    renderDialog();
    expect(
      await screen.findByText(/can restore it for 7 days/)
    ).toBeInTheDocument();
  });

  it("names the Jobs the server says will be cancelled, asking for this Case's policy", async () => {
    fns.getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canIncludeBreachCredentials: false,
      canManage: true,
      cancellableJobs: 2,
    });
    renderDialog();
    expect(
      await screen.findByText(/2 queued or running Jobs will be cancelled/)
    ).toBeInTheDocument();
    expect(fns.getDeletionPolicyFn).toHaveBeenCalledWith({
      data: { caseId: CASE.id },
    });
  });

  it("says 1 Job in the singular", async () => {
    fns.getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canIncludeBreachCredentials: false,
      canManage: true,
      cancellableJobs: 1,
    });
    renderDialog();
    expect(
      await screen.findByText(/1 queued or running Job will be cancelled/)
    ).toBeInTheDocument();
  });

  it("does not mention Jobs when none would be cancelled", async () => {
    renderDialog();
    await screen.findByText(/can restore it for 30 days/);
    expect(screen.queryByText(/will be cancelled/)).not.toBeInTheDocument();
  });

  it("deletes with one click and reports the Case that was deleted", async () => {
    const { onDeleted } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Delete case" }));
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledWith(CASE);
    });
    expect(fns.deleteCaseFn).toHaveBeenCalledWith({
      data: { caseId: CASE.id },
    });
  });

  it("keeps the dialog open with the failure when the delete is refused", async () => {
    fns.deleteCaseFn.mockRejectedValue(
      new Error("Only an owner or admin can delete, restore or purge a Case")
    );
    const { onDeleted } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Delete case" }));
    expect(
      await screen.findByText(/Only an owner or admin can delete/)
    ).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
