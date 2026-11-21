// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DossierSearch,
  DossierTab,
} from "@/domains/dossier/lib/dossier-tabs";
import type { EntityRecord } from "@/domains/entities/types";
import {
  matchesChoice,
  matchesQ,
  memoryListProcedure,
} from "@/testing/memory-list";
import { procedureDouble } from "@/testing/orpc-client";
import {
  buildCaseIdentifierRecord,
  buildEntityRecord,
} from "@/testing/records";
import { RouteCaseProvider } from "@/testing/route-case";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";
import { createTestRouter, testRouterWrapper } from "@/testing/test-router";
import { DEFAULT_ALLOWED_EGRESS } from "@watchdog/domain/schemas/caps";
import { testCaseId } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

// The trail reads the router's matches, which a test router does not have: keep only the
// `current` slot, where the Dossier puts the Entity's name.
vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: ({ current }: { current?: React.ReactNode }) => (
    <nav aria-label="Breadcrumb">{current}</nav>
  ),
}));

// The Plate editor installs a global store at import and is not what a Dossier test is about.
vi.mock("@/shared/ui/rich-text", () => ({
  RichTextEditor: ({
    value,
    ariaLabel,
  }: {
    value: string;
    ariaLabel?: string;
  }) => (
    <textarea
      aria-label={ariaLabel ?? "Rich text editor"}
      value={value}
      readOnly
    />
  ),
}));

// The oRPC client is the network boundary: the tests set what each procedure answers.
vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { Dossier } from "@/domains/dossier/components/dossier";

const listEvidence = procedureDouble("evidence.list");

const CASE = {
  id: testCaseId(10),
  slug: "alpha-case",
  name: "Alpha Case",
  description: null,
  allowedEgress: [...DEFAULT_ALLOWED_EGRESS],
};

const ENTITY: EntityRecord = buildEntityRecord({
  id: testId(1),
  caseId: CASE.id,
  slug: "alpha",
  name: "Alpha Entity",
  kind: "person",
});

const IDENTIFIERS = [
  buildCaseIdentifierRecord({
    id: testId(31),
    entityId: ENTITY.id,
    type: "email",
    value: "alpha@example.com",
  }),
  buildCaseIdentifierRecord({
    id: testId(32),
    entityId: ENTITY.id,
    type: "phone",
    value: "+15551212",
  }),
];

const getEntity = procedureDouble("entities.get");
const listIdentifiers = procedureDouble("identifiers.list");
const countIdentifierTypes = procedureDouble("identifiers.typeCounts");
const getTaskBoard = procedureDouble("tasks.board");

beforeAll(preloadSharedLazyChunks);

beforeEach(() => {
  getEntity.mockReset().mockResolvedValue(ENTITY);
  for (const list of [
    procedureDouble("claims.list"),
    procedureDouble("edges.list"),
    procedureDouble("events.list"),
    procedureDouble("questions.list"),
  ]) {
    list
      .mockReset()
      .mockImplementation(memoryListProcedure([], { matches: () => false }));
  }
  listEvidence
    .mockReset()
    .mockImplementation(memoryListProcedure([], { matches: () => false }));
  listIdentifiers.mockReset().mockImplementation(
    memoryListProcedure(IDENTIFIERS, {
      matches: (row, data) =>
        matchesChoice(row.type, data.type) &&
        matchesQ(data, [row.value, row.platform, row.notes]),
    })
  );
  // The Identifiers tab groups by type: one email, one phone, each group open.
  countIdentifierTypes.mockReset().mockResolvedValue({
    counts: [
      { type: "email", count: 1 },
      { type: "phone", count: 1 },
    ],
    isCapped: false,
  });
  getTaskBoard.mockReset().mockResolvedValue({ items: [], isTruncated: false });
});

/** The route's part: the tab in "the URL" (state here). */
function Route({ initial }: { initial: DossierSearch }) {
  const [search, setSearch] = useState(initial);
  return (
    <Dossier
      entitySlug="alpha"
      search={search}
      onSearchChange={() => undefined}
      onTabChange={(tab: DossierTab) => {
        setSearch({ tab });
      }}
    />
  );
}

function renderDossier(initial: DossierSearch = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Router = testRouterWrapper(createTestRouter());
  return render(
    <Router>
      <RouteCaseProvider routeCase={CASE}>
        <QueryClientProvider client={client}>
          <Route initial={initial} />
        </QueryClientProvider>
      </RouteCaseProvider>
    </Router>
  );
}

describe("Dossier", () => {
  it("shows the Entity's name, its actions and every tab", async () => {
    renderDossier();

    expect(await screen.findByLabelText("Entity name")).toHaveValue(
      "Alpha Entity"
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete entity" })
    ).toBeInTheDocument();
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    expect(
      tabs.map((tab) => tab.textContent?.replace(/\d+$/, "").trim())
    ).toEqual([
      "Overview",
      "Notes",
      "Claims",
      "Identifiers",
      "Connections",
      "Evidence",
      "Events",
      "Questions",
      "Tasks",
    ]);
    expect(screen.getByRole("tab", { name: /Overview/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("counts the Identifiers tab from the list's total and lists them in the Overview", async () => {
    renderDossier();

    expect(
      await screen.findByRole("tab", { name: /Identifiers\s*2/ })
    ).toBeInTheDocument();
    expect(await screen.findByDisplayValue("alpha@example.com")).toBeVisible();
    expect(screen.getByDisplayValue("+15551212")).toBeVisible();
  });

  it("opens the Identifiers tab on a click and shows its rows", async () => {
    const user = userEvent.setup({ delay: null });
    renderDossier();
    await user.click(await screen.findByRole("tab", { name: /Identifiers/ }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Identifiers/ })).toHaveAttribute(
        "aria-selected",
        "true"
      );
    });
    expect(
      await screen.findByRole("searchbox", { name: "Search identifiers" })
    ).toBeInTheDocument();
    expect(await screen.findByDisplayValue("alpha@example.com")).toBeVisible();
  });

  it("asks before deleting the Entity", async () => {
    const user = userEvent.setup({ delay: null });
    renderDossier();
    await user.click(
      await screen.findByRole("button", { name: "Delete entity" })
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", { name: "Delete entity" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" })
    ).toBeInTheDocument();
  });
});
