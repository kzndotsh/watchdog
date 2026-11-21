import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LAST_CASE_STORAGE_KEY,
  readLastCaseId,
} from "@/domains/cases/lib/active-case";
import type { CaseRecord } from "@/domains/cases/types";
import { Toaster } from "@/shared/ui/toast";

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

const cases = vi.hoisted(() => ({
  alpha: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    slug: "alpha",
    name: "Alpha",
    description: null,
    allowedEgress: ["local", "target"],
  } as CaseRecord,
  beta: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    slug: "beta",
    name: "Beta",
    description: null,
    allowedEgress: ["local", "target"],
  } as CaseRecord,
}));

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { CaseList } from "@/domains/cases/components/case-list";
import { procedureDouble } from "@/testing/orpc-client";

procedureDouble("cases.list").mockImplementation(async () => ({
  items: [cases.alpha, cases.beta],
  nextCursor: null,
  total: { count: 2, isCapped: false },
}));

function renderCaseList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Toaster />
      <CaseList />
    </QueryClientProvider>
  );
}

async function openBeta() {
  await screen.findByText("Beta");
  // Cards sort by name: Alpha first, Beta second.
  const opens = screen.getAllByRole("button", { name: "Open" });
  await userEvent.click(opens[1]!);
}

describe("CaseList switching", () => {
  afterEach(() => {
    window.localStorage.removeItem(LAST_CASE_STORAGE_KEY);
  });

  it("remembers the Case as the last one entered and opens its Overview", async () => {
    navigate.mockClear();
    renderCaseList();

    await openBeta();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/cases/$caseSlug",
        params: { caseSlug: "beta" },
      });
    });
    expect(readLastCaseId()).toBe(cases.beta.id);
    expect(within(document.body).queryByText(/Couldn't/)).toBeNull();
  });
});
