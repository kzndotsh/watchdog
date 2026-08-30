import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EntityRecord } from "@/domains/entities/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/shared/layout/app-breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}));

vi.mock("@/shared/ui/shadcn/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  notFound: () => {
    throw new Error("not found");
  },
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  bindCasesChangedInvalidation: vi.fn(),
}));

vi.mock("@/domains/dossier/hooks/use-dossier-shell", () => ({
  useDossierShell: () => ({
    evidenceAll: [],
    evidencePending: false,
    previewEvidence: null,
    setPreviewEvidence: vi.fn(),
    editOpen: false,
    setEditOpen: vi.fn(),
    editError: null,
    setEditError: vi.fn(),
    handleEvidenceClick: vi.fn(),
    counts: {
      claims: 0,
      identifiers: 0,
      connections: 0,
      evidence: 0,
      events: 0,
      questions: 0,
      tasks: 0,
    },
    renameMutation: { mutate: vi.fn(), isPending: false },
    editMutation: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock("@/domains/dossier/components/claims-section", () => ({
  ClaimsSection: () => null,
}));
vi.mock("@/domains/dossier/components/connections-section", () => ({
  ConnectionsSection: () => null,
}));
vi.mock("@/domains/dossier/components/disprove-section", () => ({
  DisproveSection: () => null,
}));
vi.mock("@/domains/dossier/components/dossier-edit-dialog", () => ({
  DossierEditDialog: () => null,
}));
vi.mock("@/domains/dossier/components/dossier-export-menu", () => ({
  DossierExportMenu: () => <div>Export menu</div>,
}));
vi.mock("@/domains/dossier/components/entity-evidence-section", () => ({
  EntityEvidenceSection: () => null,
}));
vi.mock("@/domains/dossier/components/events-section", () => ({
  EventsSection: () => null,
}));
vi.mock("@/domains/dossier/components/evidence-preview-drawer", () => ({
  EvidencePreviewDrawer: () => null,
}));
vi.mock("@/domains/dossier/components/identifiers-section", () => ({
  IdentifiersSection: () => null,
}));
vi.mock("@/domains/dossier/components/questions-section", () => ({
  QuestionsSection: () => null,
}));
vi.mock("@/domains/dossier/components/summary-notes-section", () => ({
  SummarySection: () => null,
  NotesSection: () => null,
}));
vi.mock("@/domains/tasks/components/dossier-tasks-section", () => ({
  DossierTasksSection: () => null,
}));

const resolveSuspenseQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) => resolveSuspenseQueryMock(...args),
    useSuspenseQueries: (options: {
      queries: { queryKey: readonly unknown[] }[];
    }) => options.queries.map((query) => resolveSuspenseQueryMock(query)),
  };
});

import { Dossier } from "@/domains/dossier/components/dossier";

const CASE = {
  id: testId(10),
  slug: "alpha-case",
  name: "Alpha Case",
  description: null,
  allowThirdPartyEgress: false,
};

const ENTITY: EntityRecord = {
  id: testId(1),
  caseId: CASE.id,
  slug: "alpha",
  name: "Alpha Entity",
  kind: "person",
  summary: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderDossier(active: typeof CASE | null) {
  resolveSuspenseQueryMock.mockReset();
  resolveSuspenseQueryMock.mockImplementation(
    (options: { queryKey?: readonly unknown[] }) => {
      const root = options.queryKey?.[0];
      if (root === "cases") {
        return {
          data: active
            ? { cases: [active], active }
            : { cases: [], active: null },
        };
      }
      if (root === "entity") {
        return { data: ENTITY };
      }
      return { data: null };
    }
  );

  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Dossier entitySlug="alpha" onTabChange={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("Dossier", () => {
  it("prompts users to select a case when none is active", () => {
    renderDossier(null);
    expect(screen.getByRole("link", { name: "Select a case" })).toHaveAttribute(
      "href",
      "/cases"
    );
    expect(
      screen.queryByRole("button", { name: "Edit" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Export menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText("Export menu")).not.toBeInTheDocument();
  });

  it("renders the entity dossier chrome when a case is active", () => {
    renderDossier(CASE);
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByText("Export menu")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Notes/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Claims/i })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Identifiers/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Connections/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Evidence/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Events/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Questions/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Tasks/i })).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(resolveSuspenseQueryMock).toHaveBeenCalled();
    expect(resolveSuspenseQueryMock.mock.calls.length).toBeGreaterThanOrEqual(
      2
    );
  });
});
