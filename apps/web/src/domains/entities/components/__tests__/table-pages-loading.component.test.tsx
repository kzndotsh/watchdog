import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { identifierListView } from "@/domains/entities/identifiers/queries";
import { entityListView } from "@/domains/entities/queries";
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

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { EntityTable } from "@/domains/entities/components/entity-table";
import { IdentifiersPage } from "@/domains/entities/components/identifiers-page";

// The first paint of a list that has not settled is its skeleton: the empty text is for a
// settled, empty list.

const CASE = buildCaseRecord();
const EMPTY_ENTITIES = /no entities yet/i;
const EMPTY_IDENTIFIERS = /no identifiers yet/i;

/** The markup of the first render, before any fetch settles. */
function firstPaint(client: QueryClient, page: React.ReactNode): string {
  const { container, unmount } = render(
    <QueryClientProvider client={client}>
      <RouteCaseProvider routeCase={CASE}>{page}</RouteCaseProvider>
    </QueryClientProvider>
  );
  const html = container.innerHTML;
  unmount();
  return html;
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("Entities page loading", () => {
  it("paints the table skeleton, not the empty text, while pending", () => {
    const html = firstPaint(
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

    const html = firstPaint(
      client,
      <EntityTable search={{}} onSearchChange={vi.fn()} />
    );

    expect(html).toMatch(EMPTY_ENTITIES);
    expect(html).not.toContain('data-slot="skeleton"');
  });
});

describe("Identifiers page loading", () => {
  it("paints the table skeleton, not the empty text, while pending", () => {
    const html = firstPaint(
      newClient(),
      <IdentifiersPage search={{}} onSearchChange={vi.fn()} />
    );

    expect(html).toContain('data-slot="skeleton"');
    expect(html).not.toMatch(EMPTY_IDENTIFIERS);
  });

  it("shows the empty text once the Case has no identifiers", () => {
    const client = newClient();
    client.setQueryData(
      identifierListView.key({ caseId: CASE.id }, identifierList.queryOf({})),
      {
        pages: [
          { items: [], nextCursor: null, total: { count: 0, isCapped: false } },
        ],
        pageParams: [undefined],
      }
    );

    const html = firstPaint(
      client,
      <IdentifiersPage search={{}} onSearchChange={vi.fn()} />
    );

    expect(html).toMatch(EMPTY_IDENTIFIERS);
    expect(html).not.toContain('data-slot="skeleton"');
  });
});
