import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigate,
    Link: ({ to, children }: { to: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { FirstCaseStep } from "@/domains/cases/components/first-case-step";
import {
  LAST_CASE_STORAGE_KEY,
  readLastCaseId,
} from "@/domains/cases/lib/active-case";
import { casesKeys } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { procedureDouble } from "@/testing/orpc-client";
import { buildCaseRecord } from "@/testing/records";

const fns = {
  createCaseFn: procedureDouble("cases.create"),
  getDeletionPolicyFn: procedureDouble("cases.deletionPolicy"),
  getCasesContextFn: procedureDouble("cases.list"),
};

function renderStep() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FirstCaseStep />
    </QueryClientProvider>
  );
  return client;
}

describe("FirstCaseStep", () => {
  afterEach(() => {
    window.localStorage.removeItem(LAST_CASE_STORAGE_KEY);
  });

  beforeEach(() => {
    navigate.mockReset();
    fns.createCaseFn.mockReset();
    fns.getDeletionPolicyFn.mockReset().mockResolvedValue({
      restoreWindowDays: 30,
      canManage: false,
      cancellableJobs: 0,
      canIncludeBreachCredentials: false,
    });
    fns.getCasesContextFn.mockReset().mockResolvedValue({
      items: [],
      nextCursor: null,
      total: { count: 0, isCapped: false },
    });
  });

  it("creates the Case, teaches the visible Cases about it, remembers it as the last Case and opens its overview", async () => {
    const created = buildCaseRecord({ name: "First", slug: "first" });
    fns.createCaseFn.mockResolvedValue(created);
    const user = userEvent.setup();
    const client = renderStep();

    expect(screen.getByText("Create your first Case")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Case name"), "First");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/cases/$caseSlug",
        params: { caseSlug: "first" },
      });
    });
    expect(fns.createCaseFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: "First", slug: "first" })
    );
    expect(client.getQueryData<CaseRecord[]>(casesKeys.visible())).toEqual([
      created,
    ]);
    expect(readLastCaseId()).toBe(created.id);
  });

  it("stays on the step when the create fails", async () => {
    fns.createCaseFn.mockRejectedValue(new Error("Slug taken"));
    const user = userEvent.setup();
    renderStep();

    await user.type(screen.getByLabelText("Case name"), "First");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(fns.createCaseFn).toHaveBeenCalled();
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("always offers Settings", () => {
    renderStep();
    expect(screen.getByText("Open Settings")).toBeInTheDocument();
  });

  it("offers the restore path to owners and admins", async () => {
    fns.getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canManage: true,
      cancellableJobs: 0,
      canIncludeBreachCredentials: false,
    });
    renderStep();
    expect(
      await screen.findByText("Restore a deleted Case")
    ).toBeInTheDocument();
  });

  it("hides the restore path from a member", async () => {
    renderStep();
    await waitFor(() => {
      expect(fns.getDeletionPolicyFn).toHaveBeenCalled();
    });
    expect(screen.queryByText("Restore a deleted Case")).toBeNull();
  });
});
