import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseEgress } from "@/domains/cases/types";
import type { EgressBlock } from "@/domains/jobs/lib/egress-block";
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

import { EgressBlockNotice } from "@/domains/cases/components/egress-block-notice";
import { createTestRouter, testRouterWrapper } from "@/testing/test-router";

const router = createTestRouter();
const render = (ui: ReactElement) =>
  rtlRender(ui, { wrapper: testRouterWrapper(router) });

const CASE: CaseEgress = {
  id: testCaseId(1),
  slug: "alpha",
  allowedEgress: ["local", "target"],
};

const BLOCK: EgressBlock = {
  classes: ["public_lookup", "account_lookup"],
  destinations: ["crt.sh", "api.shodan.io"],
};

function renderNotice() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <EgressBlockNotice caseEgress={CASE} block={BLOCK} subject="playbook" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  getDeletionPolicyFn.mockReset();
  updateCaseFn.mockReset();
});

describe("EgressBlockNotice", () => {
  it("names the blocked classes and where the seed would go", async () => {
    getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canIncludeBreachCredentials: false,
      canManage: true,
    });
    renderNotice();

    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent(
      "does not allow Public lookups, Account lookups"
    );
    expect(notice).toHaveTextContent("would contact crt.sh, api.shodan.io");
    expect(notice).toHaveTextContent("playbook");
  });

  it("offers an owner or admin the button that allows the classes, keeping what is allowed", async () => {
    getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canIncludeBreachCredentials: false,
      canManage: true,
    });
    updateCaseFn.mockResolvedValue({
      ...CASE,
      name: "Alpha",
      description: null,
      allowedEgress: ["local", "target", "public_lookup", "account_lookup"],
    });
    renderNotice();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Allow Public lookups, Account lookups",
      })
    );

    await waitFor(() => {
      expect(updateCaseFn).toHaveBeenCalledWith({
        data: {
          caseId: CASE.id,
          allowedEgress: ["local", "target", "public_lookup", "account_lookup"],
        },
      });
    });
  });

  it("gives a member no button and says who can allow it", async () => {
    getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canIncludeBreachCredentials: false,
      canManage: false,
    });
    renderNotice();

    expect(
      await screen.findByText(/Ask an owner or admin to allow it/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
