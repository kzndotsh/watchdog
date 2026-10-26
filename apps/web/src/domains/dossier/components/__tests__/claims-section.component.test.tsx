import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { DossierClaimsSearch } from "@/domains/dossier/lib/dossier-tabs";
import type { ClaimRecord } from "@/domains/entities/claims/types";
import { testId } from "@watchdog/test-kit";

// Only the network boundary is faked: the section reads claims through the real
// `claimListView` under a real QueryClient, so a wrong query key or a broken fetch shows
// as a missing claim (docs/contributing/testing/standards.md Mock policy).
vi.mock("@/domains/entities/claims/claims.functions", () => ({
  listClaimsPageFn: vi.fn(),
  createClaimFn: vi.fn(),
  updateClaimFn: vi.fn(),
  retractClaimFn: vi.fn(),
}));

// Linked titles come from `evidence.getMany` (#559): never the Case's whole Evidence list.
vi.mock("@/domains/intake/intake.functions", () => ({
  getEvidenceManyFn: vi.fn(),
  listEvidencePageFn: vi.fn(),
  listEvidencePickerPageFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { ClaimsSection } from "@/domains/dossier/components/claims-section";
import {
  listClaimsPageFn,
  retractClaimFn,
  updateClaimFn,
} from "@/domains/entities/claims/claims.functions";
import { getEvidenceManyFn } from "@/domains/intake/intake.functions";
import { toast } from "@/shared/ui/toast";
import {
  lastListRequest,
  matchesChoice,
  matchesQ,
  memoryListPage,
} from "@/testing/memory-list";
import { buildClaimRecord, buildEvidenceRecord } from "@/testing/records";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";
import { testCaseId } from "@watchdog/schemas/testing";

const ACTIVE: ClaimRecord = {
  version: 1,
  id: testId(1),
  entityId: testId(20),
  text: "Observed at the scene",
  class: "observation",
  confidence: "possible",
  evidenceIds: [],
  retracted: false,
  retractKind: null,
  retractedReason: null,
  retractedBy: null,
  retractedAt: null,
};

/** The Claim list on the "server": the live Claims unless `retracted`, this Entity's only. */
function serve(claims: readonly ClaimRecord[]) {
  vi.mocked(listClaimsPageFn).mockImplementation(
    memoryListPage(claims, {
      pageSize: 5,
      matches: (row, data) =>
        row.retracted === (data.retracted === true) &&
        matchesChoice(row.class, data.class) &&
        (data.entityId === undefined || data.entityId === row.entityId) &&
        matchesQ(data, [row.text]),
      compare: (sort) => (a, b) =>
        sort === "added.desc"
          ? b.id.localeCompare(a.id)
          : a.id.localeCompare(b.id),
    })
  );
}

const lastRequest = () => lastListRequest(vi.mocked(listClaimsPageFn));

const CASE_ID = testCaseId(10);
const ENTITY_ID = testId(20);

/** `count` Claims of the Entity: every fourth retracted, classes alternating. */
function entityClaims(count: number): ClaimRecord[] {
  return Array.from({ length: count }, (_, n) =>
    buildClaimRecord({
      id: testId(6000 + n),
      entityId: ENTITY_ID,
      text: `Claim ${String(n).padStart(2, "0")} on ${n % 2 === 0 ? "hosting" : "payments"}`,
      class: n % 2 === 0 ? "observation" : "allegation",
      retracted: n % 4 === 3,
      retractKind: n % 4 === 3 ? "contested" : null,
    })
  );
}

/** The Claims tab: the view in "the URL" (state here), as the Dossier route keeps it. */
function TabSection({
  initial,
  onPatch,
}: {
  initial: DossierClaimsSearch;
  onPatch: (patch: Readonly<Record<string, unknown>>) => void;
}) {
  const [search, setSearch] = useState(initial);
  return (
    <ClaimsSection
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
  rows: readonly ClaimRecord[],
  initial: DossierClaimsSearch = {}
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

function renderClaims(claims: ClaimRecord[]) {
  serve(claims);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ClaimsSection
        caseId={testId(10)}
        entityId={testId(20)}
        entitySlug="alpha"
      />
    </QueryClientProvider>
  );
}

beforeAll(preloadSharedLazyChunks);

describe("ClaimsSection", () => {
  it("shows inline empty copy when there are no active claims", async () => {
    renderClaims([]);
    expect(
      await screen.findByText("No claims yet — add one or run a Capability.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("lists non-retracted claims", async () => {
    renderClaims([ACTIVE]);
    expect(
      await screen.findByText("Observed at the scene")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Claim actions" })
    ).toBeInTheDocument();
  });

  it("titles linked chips from a by-ids read of exactly the linked ids", async () => {
    const evidenceId = testId(99);
    const onEvidenceClick = vi.fn();
    serve([{ ...ACTIVE, evidenceIds: [evidenceId] }]);
    vi.mocked(getEvidenceManyFn).mockResolvedValue([
      buildEvidenceRecord({ id: evidenceId, label: "leaked-db.csv" }),
    ]);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ClaimsSection
          caseId={testId(10)}
          entityId={testId(20)}
          entitySlug="alpha"
          onEvidenceClick={onEvidenceClick}
        />
      </QueryClientProvider>
    );
    expect(
      await screen.findByRole("button", {
        name: "Preview evidence: leaked-db.csv",
      })
    ).toBeInTheDocument();
    expect(getEvidenceManyFn).toHaveBeenCalledWith({
      data: { caseId: testId(10), ids: [evidenceId] },
    });
  });

  it.each([
    ["Contest", "Couldn't contest claim"],
    ["Disprove", "Couldn't disprove claim"],
    ["Retract", "Couldn't retract claim"],
  ])("reads %s failures as house failure copy", async (label, expected) => {
    // Non-Error rejection, so the fallback copy is what renders.
    vi.mocked(retractClaimFn).mockRejectedValueOnce("boom");
    const user = userEvent.setup();
    renderClaims([ACTIVE]);

    await user.click(
      await screen.findByRole("button", { name: "Claim actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: label }));
    await user.type(screen.getByRole("textbox"), "because");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it("refetches the list after a retract so the claim leaves it", async () => {
    // The refetch happens only if the mutation invalidates the key the list reads.
    vi.mocked(retractClaimFn).mockResolvedValueOnce({
      ...ACTIVE,
      retracted: true,
      retractKind: "retracted",
    });
    const user = userEvent.setup();
    renderClaims([ACTIVE]);
    serve([]);

    await user.click(
      await screen.findByRole("button", { name: "Claim actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Retract" }));
    await user.type(screen.getByRole("textbox"), "because");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("No claims yet — add one or run a Capability.")
    ).toBeInTheDocument();
  });

  it("sends the version the editor opened at, and a stale save offers Reload (#307)", async () => {
    const opened = { ...ACTIVE, version: 7 };
    const stale = Object.assign(
      new Error("Claim changed since you opened it"),
      {
        code: "CONFLICT",
        status: 409,
        data: {
          code: "stale_version",
          entity: "Claim",
          id: ACTIVE.id,
          currentVersion: 8,
        },
      }
    );
    vi.mocked(updateClaimFn).mockRejectedValueOnce(stale);
    const user = userEvent.setup();
    renderClaims([opened]);

    await user.click(
      await screen.findByRole("button", { name: "Claim actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    // Another writer saved while the editor was open: the list now holds version 8.
    serve([{ ...opened, version: 8, text: "Changed by someone else" }]);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateClaimFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        claimId: ACTIVE.id,
        expectedVersion: 7,
      }),
    });
    expect(
      await screen.findByText("Claim changed since you opened it")
    ).toBeInTheDocument();
    const [toastArgs] = vi.mocked(toast.add).mock.calls[0] ?? [];
    expect(toastArgs).toMatchObject({
      title: "This claim changed since you opened it.",
      type: "error",
      actionProps: { children: "Reload" },
    });

    // Reload refetches the list and closes the editor on the fresh row.
    render(
      <button type="button" onClick={toastArgs?.actionProps?.onClick}>
        Toast action
      </button>
    );
    await user.click(screen.getByRole("button", { name: "Toast action" }));
    expect(
      await screen.findByText("Changed by someone else")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("pages the Entity's live Claims, the Entity fixed on every request", async () => {
    const user = userEvent.setup();
    renderTab(entityClaims(10));
    // 10 Claims, 2 retracted: the default view is the 8 live ones.
    expect(await screen.findByText("Showing 5 of 8")).toBeInTheDocument();
    expect(lastRequest()).toEqual({ caseId: CASE_ID, entityId: ENTITY_ID });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 8")).toBeInTheDocument();
    expect(lastRequest()).toMatchObject({ entityId: ENTITY_ID, cursor: "5" });
  });

  it("searches, filters and sorts on the server, never offering or writing the Entity", async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTab(entityClaims(20));
    await screen.findByText("Showing 5 of 15");

    await user.click(screen.getByRole("searchbox", { name: "Search claims" }));
    await user.paste("hosting");
    await user.tab();
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({
        q: "hosting",
        entityId: ENTITY_ID,
      });
    });
    expect(await screen.findByText("Showing 5 of 10")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("combobox", { name: "Filter" }));
    expect(
      screen.queryByRole("option", { name: "Entity" })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Retracted" }));
    await user.click(screen.getByRole("switch", { name: "Retracted only" }));
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ retracted: true, q: "hosting" });
    });
    await user.keyboard("{Escape}");
    // payments Claims are the odd ones, so the retracted ones (n % 4 == 3) never match "hosting".
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Display options" }));
    await user.click(
      await screen.findByRole("radio", { name: /Added, Newest/ })
    );
    await waitFor(() => {
      expect(lastRequest()).toMatchObject({ sort: "added.desc" });
    });
    for (const [patch] of onPatch.mock.calls) {
      expect(patch).not.toHaveProperty("entityId");
    }
  });

  it("opens the tab's view from the URL: the retracted Claims, without actions", async () => {
    renderTab(entityClaims(20), { retracted: true, q: "payments" });
    expect(await screen.findByText("Showing 5")).toBeInTheDocument();
    expect(lastRequest()).toEqual({
      caseId: CASE_ID,
      entityId: ENTITY_ID,
      retracted: true,
      q: "payments",
    });
    expect(
      within(screen.getByRole("group", { name: "Active filters" })).getByText(
        "Retracted"
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText("Contested").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Claim actions" })
    ).not.toBeInTheDocument();
  });

  it("says “No claims yet” on the tab only while unfiltered", async () => {
    renderTab([]);
    expect(await screen.findByText("No Claims Yet")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
  });
});
