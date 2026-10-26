import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { DossierIdentifiersSearch } from "@/domains/dossier/lib/dossier-tabs";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import { matchesChoice, matchesQ, memoryListPage } from "@/testing/memory-list";
import { buildCaseIdentifierRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const listIdentifiersPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  listIdentifiersPageFn,
  createIdentifierFn: vi.fn(),
  updateIdentifierFn: vi.fn(),
  deleteIdentifierFn: vi.fn(),
}));

const bulkDialog = vi.hoisted(() => ({
  onImported: undefined as
    | ((entityIds: string[], caseId: string) => Promise<void>)
    | undefined,
}));

vi.mock("@/domains/entities/components/bulk-add-identifiers-dialog", () => ({
  BulkAddIdentifiersDialog: (props: {
    onImported?: (entityIds: string[], caseId: string) => Promise<void>;
  }) => {
    bulkDialog.onImported = props.onImported;
    return null;
  },
}));

// The Evidence cell titles links and picks through `evidence.getMany` / one list page (#559).
vi.mock("@/domains/intake/intake.functions", () => ({
  getEvidenceManyFn: vi.fn().mockResolvedValue([]),
  listEvidencePageFn: vi.fn(),
  listEvidencePickerPageFn: vi.fn(),
}));

vi.mock("@/domains/entities/components/delete-identifier-dialog", () => ({
  DeleteIdentifierDialog: () => null,
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

import { IdentifiersSection } from "@/domains/dossier/components/identifiers-section";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { preloadListPopovers } from "@/testing/list-popovers";

const ENTITY = {
  id: testId(20),
  name: "Alpha",
  slug: "alpha",
};

const OTHER_ENTITY = { id: testId(21), name: "Beta", slug: "beta" };

const CASE_ID = testCaseId(10);

/** `count` Identifiers of ENTITY: alternating email and phone. */
function entityIdentifiers(count: number): CaseIdentifierRecord[] {
  return Array.from({ length: count }, (_, n) =>
    buildCaseIdentifierRecord({
      id: testId(3000 + n),
      entityId: ENTITY.id,
      type: n % 2 === 0 ? "email" : "phone",
      value: `alpha${String(n).padStart(3, "0")}@example.com`,
    })
  );
}

/** Five rows a page: enough to prove paging, small enough that each step renders fast. */
const PAGE_SIZE = 5;

function serve(rows: readonly CaseIdentifierRecord[]) {
  listIdentifiersPageFn.mockReset();
  listIdentifiersPageFn.mockImplementation(
    memoryListPage(rows, {
      pageSize: PAGE_SIZE,
      matches: (row, data) =>
        matchesChoice(row.type, data.type) &&
        (data.entityId === undefined || data.entityId === row.entityId) &&
        matchesQ(data, [row.value, row.platform, row.notes]),
      compare: (sort) => (a, b) =>
        sort === "value.desc"
          ? b.value.localeCompare(a.value)
          : a.value.localeCompare(b.value),
    })
  );
}

function lastRequest(): Record<string, unknown> {
  const call: unknown = listIdentifiersPageFn.mock.lastCall?.[0];
  if (typeof call !== "object" || call === null || !("data" in call)) {
    throw new Error("no list request yet");
  }
  const { data } = call;
  if (typeof data !== "object" || data === null) throw new Error("no data");
  return { ...data };
}

/** The Identifiers tab: the view in "the URL" (state here), as the Dossier route keeps it. */
function TabSection({
  initial,
  onPatch,
}: {
  initial: DossierIdentifiersSearch;
  onPatch: (patch: Readonly<Record<string, unknown>>) => void;
}) {
  const [search, setSearch] = useState(initial);
  return (
    <IdentifiersSection
      caseId={CASE_ID}
      entityId={ENTITY.id}
      entitySlug={ENTITY.slug}
      entity={ENTITY}
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
  rows: readonly CaseIdentifierRecord[],
  initial: DossierIdentifiersSearch = {}
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

function renderSection() {
  serve([]);
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <IdentifiersSection
        caseId={CASE_ID}
        entityId={ENTITY.id}
        entitySlug={ENTITY.slug}
        entity={ENTITY}
      />
    </QueryClientProvider>
  );
}

beforeAll(preloadListPopovers);

describe("IdentifiersSection", () => {
  it("shows inline empty copy and add controls when there are no identifiers", async () => {
    renderSection();
    expect(
      await screen.findByText(
        "No identifiers yet — add a handle, email, phone, or other ID."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bulk add" })
    ).toBeInTheDocument();
    // The Overview's nest has no toolbar: its view is the default one.
    expect(
      screen.queryByRole("searchbox", { name: "Search identifiers" })
    ).not.toBeInTheDocument();
    expect(lastRequest()).toEqual({ caseId: CASE_ID, entityId: ENTITY.id });
  });

  it("settles the Entity the bulk import wrote to after the screen moves to another Entity", async () => {
    serve([]);
    const client = new QueryClient();
    const section = (entity: typeof ENTITY) => (
      <QueryClientProvider client={client}>
        <IdentifiersSection
          caseId={CASE_ID}
          entityId={entity.id}
          entitySlug={entity.slug}
          entity={entity}
        />
      </QueryClientProvider>
    );
    const user = userEvent.setup();
    const { rerender } = render(section(ENTITY));
    // The dialog is a lazy chunk: it mounts on the first open.
    await user.click(await screen.findByRole("button", { name: "Bulk add" }));
    await waitFor(() => {
      expect(bulkDialog.onImported).toBeDefined();
    });
    rerender(section(OTHER_ENTITY));

    await bulkDialog.onImported?.([ENTITY.id], CASE_ID);

    expect(invalidateAfterEntityChanged).toHaveBeenCalledWith(client, CASE_ID, {
      entityId: ENTITY.id,
    });
    expect(invalidateAfterEntityChanged).not.toHaveBeenCalledWith(
      client,
      CASE_ID,
      expect.objectContaining({ entityId: OTHER_ENTITY.id })
    );
  });

  it("pages this Entity's Identifiers, the Entity fixed on every request", async () => {
    const user = userEvent.setup();
    renderTab([
      ...entityIdentifiers(8),
      buildCaseIdentifierRecord({ id: testId(3999), entityId: testId(99) }),
    ]);
    expect(await screen.findByText("Showing 5 of 8")).toBeInTheDocument();
    expect(lastRequest()).toEqual({ caseId: CASE_ID, entityId: ENTITY.id });

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 8")).toBeInTheDocument();
    expect(lastRequest()).toMatchObject({ entityId: ENTITY.id, cursor: "5" });
  });

  it("searches on the server, never writing the Entity to the URL", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTab(entityIdentifiers(20));
    await screen.findByText("Showing 5 of 20");

    // One paste, then blur: the search is written at once, with no debounce wait.
    await user.click(
      screen.getByRole("searchbox", { name: "Search identifiers" })
    );
    await user.paste("ha01");
    await user.tab();
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({
        q: "ha01",
        entityId: ENTITY.id,
      });
    });
    expect(await screen.findByText("Showing 5 of 10")).toBeInTheDocument();
    for (const [patch] of onPatch.mock.calls) {
      expect(patch).not.toHaveProperty("entityId");
    }
  });

  it("filters and sorts on the server, never offering or writing the Entity", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTab(entityIdentifiers(20), { q: "ha01" });
    await screen.findByText("Showing 5 of 10");

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("combobox", { name: "Filter" }));
    expect(
      screen.queryByRole("option", { name: "Entity" })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Type" }));
    await user.click(screen.getByRole("combobox", { name: "Type values" }));
    await user.click(await screen.findByRole("option", { name: "Phone" }));
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({
        type: ["phone"],
        q: "ha01",
        entityId: ENTITY.id,
      });
    });
    expect(await screen.findByText("Showing 5")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: /^Value/ }));
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ sort: "value.desc" });
    });
    for (const [patch] of onPatch.mock.calls) {
      expect(patch).not.toHaveProperty("entityId");
    }
  });

  it("opens the tab's view from the URL", async () => {
    renderTab(entityIdentifiers(20), { type: ["email"], sort: "value.desc" });
    expect(await screen.findByText("Showing 5 of 10")).toBeInTheDocument();
    expect(lastRequest()).toEqual({
      caseId: CASE_ID,
      entityId: ENTITY.id,
      type: ["email"],
      sort: "value.desc",
    });
    expect(
      within(screen.getByRole("group", { name: "Active filters" })).getByText(
        "Type: Email"
      )
    ).toBeInTheDocument();
  });

  it("says “No identifiers yet” on the tab only while unfiltered", async () => {
    renderTab([]);
    expect(await screen.findByText("No Identifiers Yet")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
  });

  it("says “Nothing matches these filters” on the tab when a search matches nothing", async () => {
    renderTab(entityIdentifiers(3), { q: "zzz-none" });
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();
    expect(screen.queryByText("No Identifiers Yet")).not.toBeInTheDocument();
  });
});
