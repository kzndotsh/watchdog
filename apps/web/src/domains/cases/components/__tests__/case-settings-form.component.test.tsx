import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/domains/cases/cases.functions", () => ({
  updateCaseFn: vi.fn(),
}));

vi.mock("@/shared/ui/shadcn/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterCaseSwitch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/domains/cases/lib/active-case", () => ({
  notifyCasesChanged: vi.fn(),
}));

vi.mock("@/domains/cases/lib/case-cache", () => ({
  writeCaseRecordCache: vi.fn(),
}));

import { CaseSettingsForm } from "@/domains/cases/components/case-settings-form";

const CASE: CaseRecord = {
  id: "case-1",
  slug: "alpha",
  name: "Alpha Case",
  description: "Notes",
  allowThirdPartyEgress: false,
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
      screen.getByRole("region", { name: "Case settings" })
    ).toBeInTheDocument();
    expect(screen.getByText("Case settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Alpha Case");
    expect(screen.getByLabelText("Description")).toHaveValue("Notes");
    expect(
      screen.getByRole("switch", { name: "Third-party egress" })
    ).not.toBeChecked();
  });

  it("reflects the third-party egress switch from the case record", () => {
    renderForm({ ...CASE, allowThirdPartyEgress: true });
    expect(
      screen.getByRole("switch", { name: "Third-party egress" })
    ).toBeChecked();
    expect(screen.getByLabelText("Name")).toHaveValue("Alpha Case");
    expect(screen.getByLabelText("Description")).toHaveValue("Notes");
  });
});
