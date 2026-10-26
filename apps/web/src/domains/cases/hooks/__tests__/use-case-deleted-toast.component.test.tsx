import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/shared/ui/toast";
import { buildCaseRecord, buildRestoredCaseRecord } from "@/testing/records";

const fns = vi.hoisted(() => ({
  restoreCaseFn: vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  restoreCaseFn: fns.restoreCaseFn,
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  getDeletionPolicyFn: vi.fn(),
  getDeletedCaseBySlugFn: vi.fn(),
  listDeletedCasesPageFn: vi.fn(),
}));

import { useCaseDeletedToast } from "../use-case-deleted-toast";

const alpha = buildCaseRecord({ name: "Alpha Case" });

function Harness() {
  const showDeletedToast = useCaseDeletedToast();
  return (
    <button
      type="button"
      onClick={() => {
        showDeletedToast(alpha);
      }}
    >
      Delete it
    </button>
  );
}

/** The real toaster: the toast, its Restore action and the follow-up toast are read from the DOM. */
function renderHarness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Toaster />
      <Harness />
    </QueryClientProvider>
  );
}

describe("useCaseDeletedToast", () => {
  beforeEach(() => {
    fns.restoreCaseFn
      .mockReset()
      .mockResolvedValue(buildRestoredCaseRecord(alpha));
  });

  it("names the deleted Case and offers Restore", async () => {
    renderHarness();

    await userEvent.click(screen.getByRole("button", { name: "Delete it" }));

    expect(
      await screen.findByText("\u201CAlpha Case\u201D deleted")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(fns.restoreCaseFn).not.toHaveBeenCalled();
  });

  it("restores the Case with the same restore procedure when Restore is pressed, and says so", async () => {
    renderHarness();
    await userEvent.click(screen.getByRole("button", { name: "Delete it" }));

    await userEvent.click(
      await screen.findByRole("button", { name: "Restore" })
    );

    await waitFor(() => {
      expect(fns.restoreCaseFn).toHaveBeenCalledWith({
        data: { caseId: alpha.id },
      });
    });
    expect(
      await screen.findByText("\u201CAlpha Case\u201D restored")
    ).toBeInTheDocument();
  });

  it("says so when the Case came back under a new link", async () => {
    fns.restoreCaseFn.mockResolvedValue(
      buildRestoredCaseRecord({
        ...alpha,
        slug: "alpha-2",
        previousSlug: alpha.slug,
      })
    );
    renderHarness();
    await userEvent.click(screen.getByRole("button", { name: "Delete it" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Restore" })
    );
    expect(
      await screen.findByText(
        /Its link \/alpha was taken by a new Case, so it is now \/alpha-2/
      )
    ).toBeInTheDocument();
  });

  it("says why when the restore is refused", async () => {
    fns.restoreCaseFn.mockRejectedValue(
      new Error("The restore window for this Case has ended")
    );
    renderHarness();
    await userEvent.click(screen.getByRole("button", { name: "Delete it" }));

    await userEvent.click(
      await screen.findByRole("button", { name: "Restore" })
    );

    expect(
      await screen.findByText("The restore window for this Case has ended")
    ).toBeInTheDocument();
  });
});
