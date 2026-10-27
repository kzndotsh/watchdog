import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { DossierQuestionsSearch } from "@/domains/dossier/lib/dossier-tabs";
import type { QuestionRecord } from "@/domains/entities/questions/types";
import {
  lastListRequest,
  matchesChoice,
  matchesQ,
  memoryListPage,
} from "@/testing/memory-list";
import { buildQuestionRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const listQuestionsPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/questions/questions.functions", () => ({
  listQuestionsPageFn,
  createQuestionFn: vi.fn(),
  updateQuestionFn: vi.fn(),
  resolveQuestionFn: vi.fn(),
  reopenQuestionFn: vi.fn(),
  deleteQuestionFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

import { QuestionsSection } from "@/domains/dossier/components/questions-section";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";

const CASE_ID = testCaseId(10);
const ENTITY_ID = testId(20);

const OPEN = buildQuestionRecord({
  id: testId(1),
  entityId: ENTITY_ID,
  text: "Who owns the domain?",
});

const RESOLVED = buildQuestionRecord({
  id: testId(2),
  entityId: ENTITY_ID,
  text: "Where were they registered?",
  status: "resolved",
  resolvedNote: "Found in WHOIS",
});

/** `count` Questions of the Entity: every third one resolved. */
function entityQuestions(count: number): QuestionRecord[] {
  return Array.from({ length: count }, (_, n) =>
    buildQuestionRecord({
      id: testId(5000 + n),
      entityId: ENTITY_ID,
      text: `Question ${String(n).padStart(2, "0")} about ${n % 2 === 0 ? "money" : "people"}`,
      status: n % 3 === 0 ? "resolved" : "open",
    })
  );
}

function serve(rows: readonly QuestionRecord[]) {
  listQuestionsPageFn.mockReset();
  listQuestionsPageFn.mockImplementation(
    memoryListPage(rows, {
      pageSize: 5,
      matches: (row, data) =>
        matchesChoice(row.status, data.status) &&
        (data.entityId === undefined || data.entityId === row.entityId) &&
        matchesQ(data, [row.text, row.resolvedNote]),
      compare: (sort) => (a, b) =>
        sort === "created.desc"
          ? b.id.localeCompare(a.id)
          : a.id.localeCompare(b.id),
    })
  );
}

const lastRequest = () => lastListRequest(listQuestionsPageFn);

function TabSection({
  initial,
  onPatch,
}: {
  initial: DossierQuestionsSearch;
  onPatch: (patch: Readonly<Record<string, unknown>>) => void;
}) {
  const [search, setSearch] = useState(initial);
  return (
    <QuestionsSection
      caseId={CASE_ID}
      entityId={ENTITY_ID}
      entitySlug="alpha"
      emptyPresentation="panel"
      view={{
        search,
        onSearchChange: (patch) => {
          onPatch(patch);
          setSearch((prev) => ({ ...prev, ...patch }));
        },
      }}
    />
  );
}

function renderTab(
  rows: readonly QuestionRecord[],
  initial: DossierQuestionsSearch = {}
) {
  serve(rows);
  const onPatch = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TabSection initial={initial} onPatch={onPatch} />
    </QueryClientProvider>
  );
  return { onPatch };
}

function renderNest(rows: readonly QuestionRecord[]) {
  serve(rows);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <QuestionsSection
        caseId={CASE_ID}
        entityId={ENTITY_ID}
        entitySlug="alpha"
      />
    </QueryClientProvider>
  );
}

beforeAll(preloadSharedLazyChunks);

describe("QuestionsSection", () => {
  it("shows inline empty copy when there are no questions", async () => {
    renderNest([]);
    expect(
      await screen.findByText("No questions — add what needs investigating.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("renders open and resolved question rows", async () => {
    renderNest([OPEN, RESOLVED]);
    expect(await screen.findByText("Who owns the domain?")).toBeInTheDocument();
    expect(screen.getByText("Where were they registered?")).toBeInTheDocument();
    expect(screen.getByText("Q01")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.getByText("→ Found in WHOIS")).toBeInTheDocument();
  });

  it("names the icon-only resolve control and opens the resolve form from it", async () => {
    const user = userEvent.setup();
    renderNest([OPEN]);
    await user.click(
      await screen.findByRole("button", { name: "Mark resolved" })
    );
    expect(
      screen.getByPlaceholderText("What resolved this?")
    ).toBeInTheDocument();
  });

  it("pages this Entity's Questions, the Entity fixed on every request", async () => {
    const user = userEvent.setup();
    renderTab(entityQuestions(8));
    expect(await screen.findByText("Showing 5 of 8")).toBeInTheDocument();
    expect(lastRequest()).toEqual({ caseId: CASE_ID, entityId: ENTITY_ID });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 8")).toBeInTheDocument();
    expect(lastRequest()).toMatchObject({ entityId: ENTITY_ID, cursor: "5" });
  });

  it("searches, filters and sorts on the server, never offering or writing the Entity", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTab(entityQuestions(20));
    await screen.findByText("Showing 5 of 20");

    await user.click(
      screen.getByRole("searchbox", { name: "Search questions" })
    );
    await user.paste("money");
    await user.tab();
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ q: "money", entityId: ENTITY_ID });
    });
    expect(await screen.findByText("Showing 5 of 10")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("combobox", { name: "Filter" }));
    expect(
      screen.queryByRole("option", { name: "Entity" })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Status" }));
    await user.click(screen.getByRole("combobox", { name: "Status values" }));
    await user.click(await screen.findByRole("option", { name: "Resolved" }));
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({
        status: ["resolved"],
        q: "money",
        entityId: ENTITY_ID,
      });
    });
    expect(await screen.findByText("Showing 4")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Display options" }));
    await user.click(
      await screen.findByRole("radio", { name: /Created, Newest/ })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ sort: "created.desc" });
    });
    for (const [patch] of onPatch.mock.calls) {
      expect(patch).not.toHaveProperty("entityId");
    }
  });

  it("opens the tab's view from the URL", async () => {
    renderTab(entityQuestions(20), { status: ["open"], sort: "created.desc" });
    expect(await screen.findByText("Showing 5 of 13")).toBeInTheDocument();
    expect(lastRequest()).toEqual({
      caseId: CASE_ID,
      entityId: ENTITY_ID,
      status: ["open"],
      sort: "created.desc",
    });
    expect(
      within(screen.getByRole("group", { name: "Active filters" })).getByText(
        "Status: Open"
      )
    ).toBeInTheDocument();
  });

  it("tells a blank tab from a filter that matches nothing", async () => {
    renderTab([]);
    expect(await screen.findByText("No Questions Yet")).toBeInTheDocument();
  });

  it("says “Nothing matches these filters” when the view matches nothing", async () => {
    renderTab(entityQuestions(3), { q: "zzz-none" });
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();
    expect(screen.queryByText("No Questions Yet")).not.toBeInTheDocument();
  });
});
