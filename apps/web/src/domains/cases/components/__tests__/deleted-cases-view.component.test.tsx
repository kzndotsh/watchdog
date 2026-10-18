import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/shared/ui/toast";
import { buildCaseRecord, buildDeletedCaseRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";

const fns = vi.hoisted(() => ({
  listDeletedCasesFn: vi.fn(),
  restoreCaseFn: vi.fn(),
  purgeCaseFn: vi.fn(),
  getDeletionPolicyFn: vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  listDeletedCasesFn: fns.listDeletedCasesFn,
  restoreCaseFn: fns.restoreCaseFn,
  purgeCaseFn: fns.purgeCaseFn,
  getDeletionPolicyFn: fns.getDeletionPolicyFn,
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  getDeletedCaseBySlugFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { DeletedCasesView } from "@/domains/cases/components/deleted-cases-view";

const ALPHA = buildDeletedCaseRecord({
  id: testCaseId(1),
  name: "Alpha Case",
  slug: "alpha",
  daysLeft: 12,
});
const BETA = buildDeletedCaseRecord({
  id: testCaseId(2),
  name: "Beta Case",
  slug: "beta",
  deletedByName: null,
  daysLeft: 1,
});

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DeletedCasesView />
    </QueryClientProvider>
  );
}

describe("DeletedCasesView", () => {
  beforeEach(() => {
    fns.listDeletedCasesFn
      .mockReset()
      .mockResolvedValue({ items: [ALPHA, BETA], nextCursor: null });
    fns.restoreCaseFn
      .mockReset()
      .mockResolvedValue(buildCaseRecord({ id: ALPHA.id, name: "Alpha Case" }));
    fns.purgeCaseFn.mockReset().mockResolvedValue(undefined);
    fns.getDeletionPolicyFn
      .mockReset()
      .mockResolvedValue({ restoreWindowDays: 30, canManage: true });
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("shows a loading state while the list is fetched", async () => {
    let finish: () => void = () => undefined;
    fns.listDeletedCasesFn.mockReturnValue(
      new Promise((resolve) => {
        finish = () => {
          resolve({ items: [], nextCursor: null });
        };
      })
    );
    renderView();
    expect(screen.getByText("Loading deleted Cases…")).toBeInTheDocument();
    finish();
    expect(await screen.findByText("No Deleted Cases")).toBeInTheDocument();
  });

  it("lists each deleted Case with who deleted it, when, and how long is left to restore", async () => {
    renderView();

    expect(await screen.findByText("Alpha Case")).toBeInTheDocument();
    expect(screen.getByText("Beta Case")).toBeInTheDocument();
    expect(screen.getByText(/by Ada Owner/)).toBeInTheDocument();
    expect(screen.getByText(/12 days left to restore/)).toBeInTheDocument();
    // A user who is gone or unknown reads as a neutral phrase, never a raw id.
    expect(screen.getByText(/by an unknown user/)).toBeInTheDocument();
    expect(screen.getByText(/1 day left to restore/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Purge now" })).toHaveLength(
      2
    );
    expect(
      await screen.findByText(/can be restored for 30 days/)
    ).toBeInTheDocument();
  });

  it("restates the restore window in the empty state", async () => {
    fns.listDeletedCasesFn.mockResolvedValue({ items: [], nextCursor: null });
    renderView();

    expect(await screen.findByText("No Deleted Cases")).toBeInTheDocument();
    expect(
      await screen.findByText(/waits here for 30 days before it is purged/)
    ).toBeInTheDocument();
  });

  it("shows the failure with a retry that asks again", async () => {
    fns.listDeletedCasesFn.mockRejectedValueOnce(new Error("database down"));
    renderView();

    expect(await screen.findByText("database down")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Alpha Case")).toBeInTheDocument();
  });

  it("restores a Case, tells the user, and refreshes the list", async () => {
    renderView();
    const row = (await screen.findByText("Alpha Case")).closest("li")!;
    fns.listDeletedCasesFn.mockResolvedValue({
      items: [BETA],
      nextCursor: null,
    });

    await userEvent.click(within(row).getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(fns.restoreCaseFn).toHaveBeenCalledWith({
        data: { caseId: ALPHA.id },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "\u201CAlpha Case\u201D restored"
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("Alpha Case")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Beta Case")).toBeInTheDocument();
  });

  it("reports a restore the server refused", async () => {
    fns.restoreCaseFn.mockRejectedValue(
      new Error("This Case is being purged and can no longer be restored")
    );
    renderView();
    const row = (await screen.findByText("Alpha Case")).closest("li")!;

    await userEvent.click(within(row).getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "This Case is being purged and can no longer be restored"
      );
    });
    expect(screen.getByText("Alpha Case")).toBeInTheDocument();
  });

  it("cannot restore a Case whose purge has begun, and shows the failed purge", async () => {
    fns.listDeletedCasesFn.mockResolvedValue({
      items: [
        buildDeletedCaseRecord({
          id: testCaseId(3),
          name: "Stuck Case",
          purging: true,
          purgeError: "store down",
        }),
      ],
      nextCursor: null,
    });
    renderView();

    await screen.findByText("Stuck Case");
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
    expect(screen.getByText(/Purge in progress/)).toBeInTheDocument();
    expect(screen.getByText(/last purge attempt failed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Purge now" })).toBeEnabled();
  });

  it("purges only after the Case name is typed, and explains that it is permanent", async () => {
    renderView();
    const row = (await screen.findByText("Alpha Case")).closest("li")!;

    await userEvent.click(
      within(row).getByRole("button", { name: "Purge now" })
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", { name: "Purge case" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/erased for good and cannot be restored/)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Only a short deletion record stays/)
    ).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Purge case" });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByRole("textbox"), "Alpha");
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByRole("textbox"), " Case");
    expect(confirm).toBeEnabled();
    expect(fns.purgeCaseFn).not.toHaveBeenCalled();

    fns.listDeletedCasesFn.mockResolvedValue({
      items: [BETA],
      nextCursor: null,
    });
    await userEvent.click(confirm);

    await waitFor(() => {
      expect(fns.purgeCaseFn).toHaveBeenCalledWith({
        data: { caseId: ALPHA.id },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Case purged");
    });
    await waitFor(() => {
      expect(screen.queryByText("Alpha Case")).not.toBeInTheDocument();
    });
  });

  it("keeps the purge confirmation open with the failure inside it", async () => {
    fns.purgeCaseFn.mockRejectedValue(new Error("Failed to purge Case"));
    renderView();
    const row = (await screen.findByText("Alpha Case")).closest("li")!;
    await userEvent.click(
      within(row).getByRole("button", { name: "Purge now" })
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "Alpha Case");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Purge case" })
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Failed to purge Case"
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("loads the next page on request", async () => {
    fns.listDeletedCasesFn
      .mockReset()
      .mockResolvedValueOnce({ items: [ALPHA], nextCursor: "17_abc" })
      .mockResolvedValueOnce({ items: [BETA], nextCursor: null });
    renderView();
    await screen.findByText("Alpha Case");

    await userEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(await screen.findByText("Beta Case")).toBeInTheDocument();
    expect(fns.listDeletedCasesFn).toHaveBeenLastCalledWith({
      data: { limit: 25, cursor: "17_abc" },
    });
    expect(
      screen.queryByRole("button", { name: "Show more" })
    ).not.toBeInTheDocument();
  });
});
