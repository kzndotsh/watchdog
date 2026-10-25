import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { testCaseId } from "@watchdog/schemas/testing";

const getDeletionPolicyFn = vi.hoisted(() => vi.fn());
const updateCaseFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/cases/cases.functions", () => ({
  updateCaseFn,
  getDeletionPolicyFn,
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterCaseSwitch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/domains/cases/lib/active-case", () => ({
  notifyCasesChanged: vi.fn(),
}));

vi.mock("@/domains/cases/hooks/case-cache", () => ({
  writeCaseRecordCache: vi.fn(),
}));

import { CaseSettingsForm } from "@/domains/cases/components/case-settings-form";
import { createTestRouter, testRouterWrapper } from "@/testing/test-router";

/** The component reads the router (unsaved-changes guard), so it renders under a real one. */
let router = createTestRouter();
const render = (ui: ReactElement) =>
  rtlRender(ui, { wrapper: testRouterWrapper(router) });

beforeEach(() => {
  router = createTestRouter();
  getDeletionPolicyFn.mockReset();
  updateCaseFn.mockReset();
  getDeletionPolicyFn.mockResolvedValue({
    restoreWindowDays: 30,
    canIncludeBreachCredentials: false,
    canManage: true,
  });
});

const CASE: CaseRecord = {
  id: testCaseId(1),
  slug: "alpha",
  name: "Alpha Case",
  description: "Notes",
  allowedEgress: ["local", "target"],
};

function renderForm(caseRow: CaseRecord = CASE) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CaseSettingsForm caseId={caseRow.id} caseRow={caseRow} />
    </QueryClientProvider>
  );
}

describe("CaseSettingsForm", () => {
  it("renders editable name and description fields from the case record", () => {
    renderForm();
    expect(
      screen.getByRole("heading", { name: "Case settings" })
    ).toBeInTheDocument();
    expect(screen.getByText("Case settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Alpha Case");
    expect(screen.getByLabelText("Description")).toHaveValue("Notes");
    // A new Case allows the target and nothing else off the install.
    expect(
      screen.getByRole("switch", { name: "The target itself" })
    ).toBeChecked();
    for (const name of ["Public lookups", "Account lookups", "AI model"]) {
      expect(screen.getByRole("switch", { name })).not.toBeChecked();
    }
  });

  it("reflects the allowed egress classes from the case record", () => {
    renderForm({ ...CASE, allowedEgress: ["local", "public_lookup", "model"] });
    expect(
      screen.getByRole("switch", { name: "Public lookups" })
    ).toBeChecked();
    expect(screen.getByRole("switch", { name: "AI model" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "The target itself" })
    ).not.toBeChecked();
    expect(screen.getByLabelText("Name")).toHaveValue("Alpha Case");
    expect(screen.getByLabelText("Description")).toHaveValue("Notes");
  });

  it("lets an owner or admin allow a class, sending the whole set with local", async () => {
    updateCaseFn.mockResolvedValue({
      ...CASE,
      allowedEgress: ["local", "target", "public_lookup"],
    });
    renderForm();
    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Public lookups" })
      ).not.toHaveAttribute("aria-disabled", "true");
    });
    expect(
      screen.queryByText(/Only an owner or admin can change this/)
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Public lookups" }));

    await waitFor(() => {
      expect(updateCaseFn).toHaveBeenCalledWith({
        data: {
          caseId: CASE.id,
          allowedEgress: ["local", "target", "public_lookup"],
        },
      });
    });
  });

  it("turns a class off without touching the others", async () => {
    updateCaseFn.mockResolvedValue(CASE);
    renderForm({ ...CASE, allowedEgress: ["local", "target", "model"] });
    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "AI model" })
      ).not.toHaveAttribute("aria-disabled", "true");
    });

    fireEvent.click(screen.getByRole("switch", { name: "AI model" }));

    await waitFor(() => {
      expect(updateCaseFn).toHaveBeenCalledWith({
        data: { caseId: CASE.id, allowedEgress: ["local", "target"] },
      });
    });
  });

  it("holds the egress switches while a change is saving, so a second change cannot drop the first", async () => {
    // A save that never lands.
    updateCaseFn.mockReturnValue(
      new Promise((resolve) => {
        void resolve;
      })
    );
    renderForm();
    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Public lookups" })
      ).not.toHaveAttribute("aria-disabled", "true");
    });

    fireEvent.click(screen.getByRole("switch", { name: "Public lookups" }));
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "AI model" })).toHaveAttribute(
        "aria-disabled",
        "true"
      );
    });
    fireEvent.click(screen.getByRole("switch", { name: "AI model" }));

    expect(updateCaseFn).toHaveBeenCalledTimes(1);
  });

  it("disables the egress switches for a member and says why", async () => {
    getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canIncludeBreachCredentials: false,
      canManage: false,
    });
    renderForm();
    expect(
      await screen.findByText(/Only an owner or admin can change this/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Public lookups" })
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Name")).toBeEnabled();
  });

  it("asks before leaving the page with an unsaved description", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Draft scope" },
    });

    router.history.push("/elsewhere");

    expect(
      await screen.findByRole("alertdialog", {
        name: "Discard unsaved changes?",
      })
    ).toHaveTextContent("your edits to this Case");
    expect(router.history.location.pathname).toBe("/");
  });

  it("navigates without asking while the form matches the Case", async () => {
    renderForm();

    router.history.push("/elsewhere");

    await waitFor(() => {
      expect(router.history.location.pathname).toBe("/elsewhere");
    });
  });
});
