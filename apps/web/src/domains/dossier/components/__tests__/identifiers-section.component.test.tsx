import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { DossierIdentifiersSearch } from "@/domains/dossier/lib/dossier-tabs";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import {
  lastProcedureInput,
  matchesChoice,
  matchesQ,
  memoryListProcedure,
} from "@/testing/memory-list";
import { procedureDouble } from "@/testing/orpc-client";
import { buildCaseIdentifierRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

// The Evidence cell titles links and picks through `evidence.getMany` / one list page (#559).

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { IdentifiersSection } from "@/domains/dossier/components/identifiers-section";
import { listDisplayStorageKey } from "@/shared/lib/list/list-display-store";
import { toast } from "@/shared/ui/toast";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";

const listIdentifiers = procedureDouble("identifiers.list");
const countIdentifierTypes = procedureDouble("identifiers.typeCounts");
const createIdentifier = procedureDouble("identifiers.create");
const deleteIdentifier = procedureDouble("identifiers.delete");

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

/** The tab's rows match a request: its type, Entity and search. */
function matchesRequest(
  row: CaseIdentifierRecord,
  data: Readonly<Record<string, unknown>>
): boolean {
  return (
    matchesChoice(row.type, data.type) &&
    (data.entityId === undefined || data.entityId === row.entityId) &&
    matchesQ(data, [row.value, row.platform, row.notes])
  );
}

function serve(rows: readonly CaseIdentifierRecord[]) {
  countIdentifierTypes.mockReset();
  countIdentifierTypes.mockImplementation(async (data) => {
    const byType = new Map<CaseIdentifierRecord["type"], number>();
    for (const row of rows) {
      if (matchesRequest(row, data)) {
        byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
      }
    }
    return {
      counts: [...byType]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, count]) => ({ type, count })),
      isCapped: false,
    };
  });
  listIdentifiers.mockReset();
  listIdentifiers.mockImplementation(
    memoryListProcedure(rows, {
      pageSize: PAGE_SIZE,
      matches: matchesRequest,
      compare: (sort) => (a, b) =>
        sort === "value.desc"
          ? b.value.localeCompare(a.value)
          : a.value.localeCompare(b.value),
    })
  );
}

function lastRequest(): Record<string, unknown> {
  return lastProcedureInput(listIdentifiers);
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
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
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

beforeAll(preloadSharedLazyChunks);

const DISPLAY_KEY = listDisplayStorageKey("dossier-identifiers");

describe("IdentifiersSection", () => {
  // These cases read the flat table; the grouped view has its own cases below.
  beforeEach(() => {
    window.localStorage.setItem(
      DISPLAY_KEY,
      JSON.stringify({
        hiddenColumns: [],
        toggles: { "group-by-type": false },
        density: "comfortable",
      })
    );
  });
  afterEach(() => {
    window.localStorage.removeItem(DISPLAY_KEY);
  });

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

  it("refreshes the list after a bulk import that finishes once the screen moved to another Entity", async () => {
    serve([]);
    let finishImport: () => void = () => undefined;
    createIdentifier.mockReset();
    createIdentifier.mockReturnValue(
      new Promise((resolve) => {
        finishImport = () => {
          resolve(buildCaseIdentifierRecord({ entityId: ENTITY.id }));
        };
      })
    );
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
    const user = userEvent.setup({ delay: null });
    const { rerender } = render(section(ENTITY));
    await user.click(await screen.findByRole("button", { name: "Bulk add" }));
    await user.click(await screen.findByLabelText("Paste"));
    await user.paste("new@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Import 1 identifier" })
    );
    await waitFor(() => {
      expect(createIdentifier).toHaveBeenCalledTimes(1);
    });
    rerender(section(OTHER_ENTITY));
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ entityId: OTHER_ENTITY.id });
    });
    const requestsBefore = listIdentifiers.mock.calls.length;

    finishImport();

    await waitFor(() => {
      expect(listIdentifiers.mock.calls.length).toBeGreaterThan(requestsBefore);
    });
    expect(createIdentifier).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: CASE_ID,
        entityId: ENTITY.id,
        value: "new@example.com",
      })
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Bulk add identifiers" })
      ).not.toBeInTheDocument();
    });
  });

  it("deletes an Identifier from its row menu: the list refetches without it", async () => {
    const user = userEvent.setup({ delay: null });
    const rows = entityIdentifiers(2);
    renderTab(rows);
    deleteIdentifier.mockReset();
    deleteIdentifier.mockImplementation(async () => {
      serve(rows.slice(1));
      return { ok: true };
    });
    const doomed = (await screen.findByDisplayValue(rows[0].value)).closest(
      "tr"
    );
    if (doomed === null) throw new Error("the Identifier has no row");
    await user.pointer({ keys: "[MouseRight]", target: doomed });
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByDisplayValue(rows[0].value)).not.toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(rows[1].value)).toBeInTheDocument();
    expect(deleteIdentifier).toHaveBeenCalledWith({
      caseId: CASE_ID,
      identifierId: rows[0].id,
    });
    expect(toast.success).toHaveBeenCalledWith("Identifier deleted");
  });

  it("pages this Entity's Identifiers, the Entity fixed on every request", async () => {
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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

  it("filters on the server, never offering or writing the Entity", async () => {
    const user = userEvent.setup({ delay: null });
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
    for (const [patch] of onPatch.mock.calls) {
      expect(patch).not.toHaveProperty("entityId");
    }
  });

  it("sorts on the server, never writing the Entity to the URL", async () => {
    const user = userEvent.setup({ delay: null });
    const { onPatch } = renderTab(entityIdentifiers(20), { q: "ha01" });
    await screen.findByText("Showing 5 of 10");

    await user.click(screen.getByRole("button", { name: /^Value/ }));
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({
        sort: "value.desc",
        entityId: ENTITY.id,
      });
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

describe("IdentifiersSection grouped by type", () => {
  afterEach(() => {
    window.localStorage.removeItem(DISPLAY_KEY);
  });

  /** 12 domains and 2 emails of ENTITY. */
  function domainsAndEmails(): CaseIdentifierRecord[] {
    return [
      ...Array.from({ length: 12 }, (_, n) =>
        buildCaseIdentifierRecord({
          id: testId(4000 + n),
          entityId: ENTITY.id,
          type: "domain",
          value: `host${String(n).padStart(2, "0")}.example`,
        })
      ),
      ...Array.from({ length: 2 }, (_, n) =>
        buildCaseIdentifierRecord({
          id: testId(4100 + n),
          entityId: ENTITY.id,
          type: "email",
          value: `ops${n}@example.com`,
        })
      ),
    ];
  }

  function typedRequests(): unknown[] {
    return listIdentifiers.mock.calls.flatMap(([input]) =>
      input.type === undefined ? [] : [input.type]
    );
  }

  it("heads each type with the server's count; a small group opens, a big one waits to be opened", async () => {
    const user = userEvent.setup({ delay: null });
    renderTab(domainsAndEmails());

    const domains = await screen.findByRole("button", { name: "Domain (12)" });
    expect(domains).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Email (2)" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(
      await screen.findByDisplayValue("ops0@example.com")
    ).toBeInTheDocument();
    // The closed group has read nothing.
    expect(typedRequests()).toEqual([["email"]]);

    await user.click(domains);
    expect(
      await screen.findByDisplayValue("host00.example")
    ).toBeInTheDocument();
    expect(lastRequest()).toEqual({
      caseId: CASE_ID,
      entityId: ENTITY.id,
      type: ["domain"],
    });
    expect(screen.getByText("Showing 5 of 12")).toBeInTheDocument();
  });

  it("counts and fills the groups under the tab's search", async () => {
    renderTab(domainsAndEmails(), { q: "ops1" });

    expect(
      await screen.findByRole("button", { name: "Email (1)" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Domain/ })
    ).not.toBeInTheDocument();
    expect(countIdentifierTypes).toHaveBeenLastCalledWith({
      caseId: CASE_ID,
      entityId: ENTITY.id,
      q: "ops1",
    });
    expect(
      await screen.findByDisplayValue("ops1@example.com")
    ).toBeInTheDocument();
    expect(lastRequest()).toEqual({
      caseId: CASE_ID,
      entityId: ENTITY.id,
      type: ["email"],
      q: "ops1",
    });
  });

  it("shows the flat table when Group by type is turned off", async () => {
    const user = userEvent.setup({ delay: null });
    renderTab(domainsAndEmails());
    await screen.findByRole("button", { name: "Domain (12)" });

    await user.click(screen.getByRole("button", { name: /^Display/ }));
    await user.click(
      await screen.findByRole("switch", { name: "Group by type" })
    );

    expect(await screen.findByText("Showing 5 of 14")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Domain (12)" })
    ).not.toBeInTheDocument();
  });
});
