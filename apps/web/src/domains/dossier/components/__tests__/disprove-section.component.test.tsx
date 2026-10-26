import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ClaimRecord } from "@/domains/entities/claims/types";
import { lastListRequest, memoryListPage } from "@/testing/memory-list";
import { buildClaimRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const listClaimsPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/claims/claims.functions", () => ({
  listClaimsPageFn,
}));

import { DisproveSection } from "@/domains/dossier/components/disprove-section";

const CASE_ID = testCaseId(10);
const ENTITY_ID = testId(20);

const RETRACTED = buildClaimRecord({
  id: testId(1),
  entityId: ENTITY_ID,
  text: "Former claim",
  retracted: true,
  retractKind: "disproved",
  retractedReason: "Contradicted by intake",
  retractedAt: "2026-01-02T00:00:00.000Z",
});

/** The Claim list on the "server": the `retracted` view, newest (highest id) first on `added.desc`. */
function renderSection(claims: readonly ClaimRecord[]) {
  listClaimsPageFn.mockReset();
  listClaimsPageFn.mockImplementation(
    memoryListPage(claims, {
      matches: (row, data) => row.retracted === (data.retracted === true),
      compare: (sort) => (a, b) =>
        sort === "added.desc"
          ? b.id.localeCompare(a.id)
          : a.id.localeCompare(b.id),
    })
  );
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DisproveSection caseId={CASE_ID} entityId={ENTITY_ID} />
    </QueryClientProvider>
  );
}

describe("DisproveSection", () => {
  it("renders nothing when there are no retracted claims", async () => {
    const { container } = renderSection([]);
    await vi.waitFor(() => {
      expect(listClaimsPageFn).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the Entity's retracted view with reason and badges", async () => {
    renderSection([RETRACTED]);
    expect(
      await screen.findByRole("heading", { name: "Disproved / Retracted" })
    ).toBeInTheDocument();
    expect(screen.getByText("Former claim")).toHaveClass("line-through");
    expect(screen.getByText("Contradicted by intake")).toBeInTheDocument();
    expect(lastListRequest(listClaimsPageFn)).toEqual({
      caseId: CASE_ID,
      entityId: ENTITY_ID,
      retracted: true,
      sort: "added.desc",
    });
  });

  it("asks for the most recently added first", async () => {
    renderSection([
      { ...RETRACTED, id: testId(2), text: "Older retracted claim" },
      { ...RETRACTED, id: testId(3), text: "Newer retracted claim" },
    ]);
    await screen.findByText("Newer retracted claim");
    const labels = screen
      .getAllByText(/retracted claim/i)
      .map((node) => node.textContent ?? "");
    expect(labels[0]).toContain("Newer retracted claim");
    expect(labels[1]).toContain("Older retracted claim");
  });
});
