// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import type {
  DossierSearch,
  DossierTab,
} from "@/domains/dossier/lib/dossier-tabs";
import type { EntityRecord } from "@/domains/entities/types";
import {
  matchesChoice,
  matchesQ,
  memoryListPage,
  type ListPageData,
} from "@/testing/memory-list";
import {
  buildCaseIdentifierRecord,
  buildEntityRecord,
} from "@/testing/records";
import { RouteCaseProvider } from "@/testing/route-case";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";
import { createTestRouter, testRouterWrapper } from "@/testing/test-router";
import { DEFAULT_ALLOWED_EGRESS } from "@watchdog/schemas/caps";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

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

// The server functions are the network boundary: every module the Dossier reads or writes
// through is faked at its edge (one spy per export), and the tests set what each answers.
const serverFn = vi.hoisted(() => {
  const spies = new Map<
    string,
    Mock<(request: { data: ListPageData }) => Promise<unknown>>
  >();
  return (name: string) => {
    const spy = spies.get(name) ?? vi.fn();
    spies.set(name, spy);
    return spy;
  };
});
const stubFns = vi.hoisted(
  () => (names: string) =>
    Object.fromEntries(names.split(" ").map((name) => [name, serverFn(name)]))
);

vi.mock("@/domains/entities/entities.functions", () =>
  stubFns(
    "listEntitiesPageFn listEntitiesPickerPageFn matchEntityNamesFn getEntitiesFn getEntityBySlugFn createEntityFn updateEntityFieldsFn recordOpenInFn deleteEntityFn"
  )
);
vi.mock("@/domains/entities/claims/claims.functions", () =>
  stubFns("listClaimsPageFn createClaimFn retractClaimFn updateClaimFn")
);
vi.mock("@/domains/entities/edges/edges.functions", () =>
  stubFns(
    "listEdgesPageFn getEdgesFn getGraphEgoFn getGraphSnapshotFn createEdgeFn updateEdgeFn deleteEdgeFn"
  )
);
vi.mock("@/domains/entities/events/events.functions", () =>
  stubFns("listEventsPageFn createEventFn deleteEventFn updateEventFn")
);
vi.mock("@/domains/entities/identifiers/identifiers.functions", () =>
  stubFns(
    "listIdentifiersPageFn createIdentifierFn updateIdentifierFn deleteIdentifierFn"
  )
);
vi.mock("@/domains/entities/questions/questions.functions", () =>
  stubFns(
    "listQuestionsPageFn createQuestionFn resolveQuestionFn updateQuestionFn reopenQuestionFn deleteQuestionFn"
  )
);
vi.mock("@/domains/entities/history/history.functions", () =>
  stubFns("listGraphHistoryFn graphRowAttributionFn")
);
vi.mock("@/domains/intake/intake.functions", () =>
  stubFns(
    "getEvidenceDownloadUrlFn listEvidencePageFn listEvidencePickerPageFn getEvidenceFn getEvidenceManyFn processEvidenceFn enrichUrlEvidenceFn dumpPasteFn dumpUrlFn softDeleteEvidenceFn restoreEvidenceFn attachEvidenceEntityFn presignUploadFn confirmFileUploadFn listEvidenceProviderCallsFn"
  )
);
vi.mock("@/domains/tasks/tasks.functions", () =>
  stubFns(
    "listTasksPageFn getTaskBoardFn getDueTasksFn getTaskFn createTaskFn updateTaskFn deleteTaskFn reorderTasksFn"
  )
);
vi.mock("@/domains/organization/organization-settings.functions", () =>
  stubFns("getOrganizationSettingsFn updateOrganizationSettingsFn")
);

import { Dossier } from "@/domains/dossier/components/dossier";

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

const getEntityBySlugFn = serverFn("getEntityBySlugFn");
const listIdentifiersPageFn = serverFn("listIdentifiersPageFn");
const getTaskBoardFn = serverFn("getTaskBoardFn");

const emptyPage = memoryListPage<unknown>([], { matches: () => false });

beforeAll(preloadSharedLazyChunks);

beforeEach(() => {
  getEntityBySlugFn.mockReset().mockResolvedValue(ENTITY);
  for (const name of [
    "listClaimsPageFn",
    "listEdgesPageFn",
    "listEventsPageFn",
    "listQuestionsPageFn",
    "listEvidencePageFn",
  ]) {
    serverFn(name).mockReset().mockImplementation(emptyPage);
  }
  listIdentifiersPageFn.mockReset().mockImplementation(
    memoryListPage(IDENTIFIERS, {
      matches: (row, data) =>
        matchesChoice(row.type, data.type) &&
        matchesQ(data, [row.value, row.platform, row.notes]),
    })
  );
  getTaskBoardFn
    .mockReset()
    .mockResolvedValue({ items: [], isTruncated: false });
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
    expect(screen.getByDisplayValue("alpha@example.com")).toBeVisible();
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
