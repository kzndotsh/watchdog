import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { identifierListView } from "@/domains/entities/identifiers/queries";
import { entitiesListQuery, entityListView } from "@/domains/entities/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import { buildCaseRecord } from "@/testing/records";
import { RouteCaseProvider } from "@/testing/route-case";
import { entityList, identifierList } from "@watchdog/schemas/graph";

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/" }, matches: [] }),
}));

vi.mock("@/domains/entities/entities.functions", () => ({
  listEntitiesFn: vi.fn(),
  getEntityBySlugFn: vi.fn(),
  createEntityFn: vi.fn(),
  updateEntityFieldsFn: vi.fn(),
}));

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  listEdgesFn: vi.fn(),
  listEdgesForCaseFn: vi.fn(),
  createEdgeFn: vi.fn(),
  updateEdgeFn: vi.fn(),
  deleteEdgeFn: vi.fn(),
}));

import { EntityTable } from "@/domains/entities/components/entity-table";
import { IdentifiersPage } from "@/domains/entities/components/identifiers-page";

// These pages render on the server first (a refresh). Nothing is fetched there, so a list
// that has not settled must paint its skeleton: the empty text is for a settled, empty list.

const CASE = buildCaseRecord();
const EMPTY_ENTITIES = /no entities yet/i;
const EMPTY_IDENTIFIERS = /no identifiers yet/i;

function serverRender(client: QueryClient, page: React.ReactNode): string {
  return renderToString(
    <QueryClientProvider client={client}>
      <RouteCaseProvider routeCase={CASE}>{page}</RouteCaseProvider>
    </QueryClientProvider>
  );
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("Entities page loading", () => {
  it("server-renders the table skeleton, not the empty text, while pending", () => {
    const html = serverRender(
      newClient(),
      <EntityTable search={{}} onSearchChange={vi.fn()} />
    );

    expect(html).toContain('data-slot="skeleton"');
    expect(html).not.toMatch(EMPTY_ENTITIES);
  });

  it("shows the empty text once the Case has no entities", () => {
    const client = newClient();
    client.setQueryData(
      entityListView.key({ caseId: CASE.id }, entityList.queryOf({})),
      {
        pages: [
          { items: [], nextCursor: null, total: { count: 0, isCapped: false } },
        ],
        pageParams: [undefined],
      }
    );

    const html = serverRender(
      client,
      <EntityTable search={{}} onSearchChange={vi.fn()} />
    );

    expect(html).toMatch(EMPTY_ENTITIES);
    expect(html).not.toContain('data-slot="skeleton"');
  });
});

describe("Identifiers page loading", () => {
  it("server-renders the table skeleton, not the empty text, while pending", () => {
    const html = serverRender(
      newClient(),
      <IdentifiersPage search={{}} onSearchChange={vi.fn()} />
    );

    expect(html).toContain('data-slot="skeleton"');
    expect(html).not.toMatch(EMPTY_IDENTIFIERS);
  });

  it("shows the empty text once the Case has no identifiers", () => {
    const client = newClient();
    client.setQueryData(entitiesListQuery(CASE.id).queryKey, []);
    client.setQueryData(
      identifierListView.key({ caseId: CASE.id }, identifierList.queryOf({})),
      {
        pages: [
          { items: [], nextCursor: null, total: { count: 0, isCapped: false } },
        ],
        pageParams: [undefined],
      }
    );
    client.setQueryData(evidenceListQuery(CASE.id).queryKey, []);
    client.setQueryData(
      evidenceListQuery(CASE.id, { isHiddenOnly: true }).queryKey,
      []
    );

    const html = serverRender(
      client,
      <IdentifiersPage search={{}} onSearchChange={vi.fn()} />
    );

    expect(html).toMatch(EMPTY_IDENTIFIERS);
    expect(html).not.toContain('data-slot="skeleton"');
  });
});
