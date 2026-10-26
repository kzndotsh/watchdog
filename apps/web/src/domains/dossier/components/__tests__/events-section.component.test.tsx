import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { DossierEventsSearch } from "@/domains/dossier/lib/dossier-tabs";
import type { EventRecord } from "@/domains/entities/events/types";
import {
  lastListRequest,
  matchesQ,
  memoryListPage,
} from "@/testing/memory-list";
import { buildEventRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const listEventsPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/events/events.functions", () => ({
  listEventsPageFn,
  createEventFn: vi.fn(),
  updateEventFn: vi.fn(),
  deleteEventFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

import { EventsSection } from "@/domains/dossier/components/events-section";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";

const CASE_ID = testCaseId(10);
const ENTITY_ID = testId(20);

/** `count` Events of the Entity, a month apart: "2024-01" .. in `when` order. */
function entityEvents(count: number): EventRecord[] {
  return Array.from({ length: count }, (_, n) =>
    buildEventRecord({
      id: testId(4000 + n),
      entityId: ENTITY_ID,
      when: `20${String(10 + n)}-01`,
      what:
        n % 2 === 0 ? `Moved office ${String(n)}` : `Filed report ${String(n)}`,
    })
  );
}

function serve(rows: readonly EventRecord[]) {
  listEventsPageFn.mockReset();
  listEventsPageFn.mockImplementation(
    memoryListPage(rows, {
      pageSize: 5,
      matches: (row, data) =>
        (data.entityId === undefined || data.entityId === row.entityId) &&
        matchesQ(data, [row.what, row.where, row.when]),
      compare: (sort) => (a, b) =>
        sort === "when.desc"
          ? b.when.localeCompare(a.when)
          : a.when.localeCompare(b.when),
    })
  );
}

const lastRequest = () => lastListRequest(listEventsPageFn);

/** The Events tab: the view in "the URL" (state here), as the Dossier route keeps it. */
function TabSection({
  initial,
  onPatch,
}: {
  initial: DossierEventsSearch;
  onPatch: (patch: Readonly<Record<string, unknown>>) => void;
}) {
  const [search, setSearch] = useState(initial);
  return (
    <EventsSection
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
  rows: readonly EventRecord[],
  initial: DossierEventsSearch = {}
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

beforeAll(preloadSharedLazyChunks);

describe("EventsSection", () => {
  it("shows inline empty copy in the Overview's nest, with no toolbar", async () => {
    serve([]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsSection
          caseId={CASE_ID}
          entityId={ENTITY_ID}
          entitySlug="alpha"
        />
      </QueryClientProvider>
    );
    expect(
      await screen.findByText("No events yet — add a dated milestone.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(lastRequest()).toEqual({ caseId: CASE_ID, entityId: ENTITY_ID });
  });

  it("renders one page of the timeline, the Entity fixed, and loads more", async () => {
    const user = userEvent.setup();
    renderTab([
      buildEventRecord({
        id: testId(3999),
        entityId: ENTITY_ID,
        when: "2026-01-15",
        what: "Met at the office",
        where: "NYC",
      }),
      ...entityEvents(7),
    ]);
    expect(await screen.findByText("Showing 5 of 8")).toBeInTheDocument();
    expect(lastRequest()).toEqual({ caseId: CASE_ID, entityId: ENTITY_ID });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Met at the office")).toBeInTheDocument();
    expect(screen.getByText(/@ NYC/)).toBeInTheDocument();
    expect(lastRequest()).toMatchObject({ entityId: ENTITY_ID, cursor: "5" });
  });

  it("searches and sorts on the server, never writing the Entity to the URL", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTab(entityEvents(12));
    await screen.findByText("Showing 5 of 12");

    await user.click(screen.getByRole("searchbox", { name: "Search events" }));
    await user.paste("moved");
    await user.tab();
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ q: "moved", entityId: ENTITY_ID });
    });
    expect(await screen.findByText("Showing 5 of 6")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Display options" }));
    await user.click(await screen.findByRole("radio", { name: /When, Z–A/ }));
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ sort: "when.desc", q: "moved" });
    });
    for (const [patch] of onPatch.mock.calls) {
      expect(patch).not.toHaveProperty("entityId");
    }
  });

  it("opens the tab's view from the URL", async () => {
    renderTab(entityEvents(12), { q: "filed", sort: "when.desc" });
    expect(await screen.findByText("Showing 5 of 6")).toBeInTheDocument();
    expect(lastRequest()).toEqual({
      caseId: CASE_ID,
      entityId: ENTITY_ID,
      q: "filed",
      sort: "when.desc",
    });
  });

  it("tells a blank timeline from a search that matches nothing", async () => {
    renderTab([]);
    expect(await screen.findByText("No Events Yet")).toBeInTheDocument();
  });

  it("says “Nothing matches these filters” when a search matches nothing", async () => {
    renderTab(entityEvents(3), { q: "zzz-none" });
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();
    expect(screen.queryByText("No Events Yet")).not.toBeInTheDocument();
  });
});
