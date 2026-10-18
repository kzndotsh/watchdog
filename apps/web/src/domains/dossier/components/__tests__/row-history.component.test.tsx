import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  GraphHistoryEntry,
  GraphHistoryPage,
} from "@watchdog/schemas/graph";
import { testId } from "@watchdog/test-kit";

// Only the network boundary is faked: the popover reads through the real
// `graphHistoryQuery` under a real QueryClient (docs/contributing/testing/standards.md Mock policy).
vi.mock("@/domains/entities/history/history.functions", () => ({
  listGraphHistoryFn: vi.fn(),
}));

import { RowHistory } from "@/domains/dossier/components/row-history";
import { listGraphHistoryFn } from "@/domains/entities/history/history.functions";
import { historyKeys } from "@/domains/entities/history/queries";

const CASE_ID = testId(10);
const ROW_ID = testId(30);

function entry(
  overrides: Partial<GraphHistoryEntry> & Pick<GraphHistoryEntry, "id">
): GraphHistoryEntry {
  return {
    caseId: CASE_ID,
    kind: "claim",
    rowId: ROW_ID,
    op: "update",
    channel: "dossier",
    actorId: testId(900),
    actorName: "ada",
    actorLabel: null,
    before: { text: "old" },
    after: { text: "new" },
    changedFields: ["text"],
    at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

const ATTRIBUTION = {
  createdBy: "ada",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedBy: "grace",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function page(partial: Partial<GraphHistoryPage>): GraphHistoryPage {
  return {
    attribution: ATTRIBUTION,
    entries: [],
    nextCursor: null,
    ...partial,
  };
}

function renderHistory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RowHistory caseId={CASE_ID} kind="claim" rowId={ROW_ID} />
    </QueryClientProvider>
  );
  return client;
}

describe("RowHistory", () => {
  it("fetches nothing until it is opened", () => {
    vi.mocked(listGraphHistoryFn).mockResolvedValue(page({}));
    const client = renderHistory();
    expect(listGraphHistoryFn).not.toHaveBeenCalled();
    expect(
      client.getQueryData(historyKeys.row(CASE_ID, "claim", ROW_ID))
    ).toBeUndefined();
  });

  it("shows who created and last changed the row, and its changes newest first", async () => {
    vi.mocked(listGraphHistoryFn).mockResolvedValue(
      page({
        entries: [
          entry({
            id: 3,
            op: "retract",
            actorName: "grace",
            changedFields: [],
          }),
          entry({
            id: 2,
            channel: "agent_write",
            actorName: "api-key:ci-bot",
            changedFields: ["text", "evidenceIds"],
          }),
          entry({
            id: 1,
            op: "create",
            actorName: "ada",
            channel: "triage_accept",
            before: null,
            changedFields: ["text"],
          }),
        ],
      })
    );
    const user = userEvent.setup();
    renderHistory();

    await user.click(
      screen.getByRole("button", { name: "History of this claim" })
    );

    expect(await screen.findByText("Created by")).toBeInTheDocument();
    expect(screen.getByText("Last changed by")).toBeInTheDocument();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Retracted");
    expect(within(items[0]!).getByLabelText("@grace")).toBeInTheDocument();
    expect(items[1]).toHaveTextContent("Updated");
    expect(items[1]).toHaveTextContent("api-key:ci-bot");
    expect(items[1]).toHaveTextContent("via agent");
    expect(items[1]).toHaveTextContent("text, evidence ids");
    expect(items[2]).toHaveTextContent("Created");
    expect(items[2]).toHaveTextContent("via Triage");
    expect(listGraphHistoryFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: CASE_ID,
        kind: "claim",
        rowId: ROW_ID,
      }),
    });
  });

  it("loads the next page with the cursor when asked for older entries", async () => {
    vi.mocked(listGraphHistoryFn)
      .mockResolvedValueOnce(
        page({ entries: [entry({ id: 2 })], nextCursor: "2" })
      )
      .mockResolvedValueOnce(
        page({
          entries: [
            entry({
              id: 1,
              op: "create",
              before: null,
              changedFields: ["text"],
            }),
          ],
        })
      );
    const user = userEvent.setup();
    renderHistory();
    await user.click(
      screen.getByRole("button", { name: "History of this claim" })
    );
    await user.click(await screen.findByRole("button", { name: "Show older" }));

    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
    expect(listGraphHistoryFn).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ cursor: "2" }),
    });
    expect(
      screen.queryByRole("button", { name: "Show older" })
    ).not.toBeInTheDocument();
  });

  it("says so when a row has no recorded changes, and names an unknown author", async () => {
    vi.mocked(listGraphHistoryFn).mockResolvedValue(
      page({
        attribution: { ...ATTRIBUTION, createdBy: null, updatedBy: null },
      })
    );
    const user = userEvent.setup();
    renderHistory();
    await user.click(
      screen.getByRole("button", { name: "History of this claim" })
    );

    expect(
      await screen.findByText(/No recorded changes yet/)
    ).toBeInTheDocument();
    expect(screen.getAllByText("an unknown author")).toHaveLength(2);
  });

  it("shows the failure when the history cannot be loaded", async () => {
    vi.mocked(listGraphHistoryFn).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderHistory();
    await user.click(
      screen.getByRole("button", { name: "History of this claim" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
