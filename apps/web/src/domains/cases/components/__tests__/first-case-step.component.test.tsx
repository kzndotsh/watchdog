import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const fns = vi.hoisted(() => ({
  createCaseFn: vi.fn(),
  getDeletionPolicyFn: vi.fn(),
  getCasesContextFn: vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  createCaseFn: fns.createCaseFn,
  getDeletionPolicyFn: fns.getDeletionPolicyFn,
  getCasesContextFn: fns.getCasesContextFn,
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  getDeletedCaseBySlugFn: vi.fn(),
  listDeletedCasesFn: vi.fn(),
}));

import { FirstCaseStep } from "@/domains/cases/components/first-case-step";
import { casesKeys } from "@/domains/cases/queries";
import type { CasesContext } from "@/domains/cases/types";
import { buildCaseRecord } from "@/testing/records";

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
  beforeEach(() => {
    navigate.mockReset();
    fns.createCaseFn.mockReset();
    fns.getDeletionPolicyFn.mockReset().mockResolvedValue({ canManage: false });
    fns.getCasesContextFn
      .mockReset()
      .mockResolvedValue({ cases: [], active: null });
  });

  it("creates the Case, makes it the Active Case in the cache and opens its overview", async () => {
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
    expect(fns.createCaseFn).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "First", slug: "first" }),
    });
    expect(
      client.getQueryData<CasesContext>(casesKeys.context())
    ).toMatchObject({ cases: [created], active: created });
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
    fns.getDeletionPolicyFn.mockResolvedValue({ canManage: true });
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
