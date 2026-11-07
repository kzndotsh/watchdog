import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Collect } from "@/domains/collect/components/collect";
import { collectListView } from "@/domains/collect/queries";
import { buildCaseRecord } from "@/testing/records";
import { RouteCaseProvider } from "@/testing/route-case";
import { collectList } from "@watchdog/schemas/jobs";
import { SidebarProvider } from "@watchdog/ui/components/sidebar";

// Collect renders on the server first (a refresh). Nothing is fetched there, so a queue
// that has not settled must paint its skeleton; "no items" is for a settled, empty queue.

const CASE = buildCaseRecord();
const QUEUE_LABEL = "Loading items";
const DETAIL_LABEL = "Loading collect detail";
const EMPTY_QUEUE = /No Items Yet/i;

/** A real router with one catch-all route, so Links build hrefs and a Navigate has a target. */
function routerAt(pathname: string) {
  const root = createRootRoute();
  const all = createRoute({ getParentRoute: () => root, path: "$" });
  return createRouter({
    routeTree: root.addChildren([all]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
}

function serverRender(client: QueryClient): string {
  return renderToString(
    <RouterContextProvider router={routerAt(`/cases/${CASE.slug}/collect`)}>
      <QueryClientProvider client={client}>
        <SidebarProvider>
          <RouteCaseProvider routeCase={CASE}>
            <Collect search={{}} onSearchChange={vi.fn()} />
          </RouteCaseProvider>
        </SidebarProvider>
      </QueryClientProvider>
    </RouterContextProvider>
  );
}

describe("Collect loading", () => {
  it("server-renders the queue and detail skeletons while pending, never the empty queue", () => {
    const html = serverRender(new QueryClient());

    expect(html).toContain(QUEUE_LABEL);
    expect(html).toContain(DETAIL_LABEL);
    expect(html).not.toMatch(EMPTY_QUEUE);
  });

  it("shows the empty queue once the first page has settled empty", () => {
    const client = new QueryClient();
    client.setQueryData(
      collectListView.key({ caseId: CASE.id }, collectList.queryOf({})),
      {
        pages: [
          { items: [], nextCursor: null, total: { count: 0, isCapped: false } },
        ],
        pageParams: [undefined],
      }
    );

    const html = serverRender(client);

    expect(html).toMatch(EMPTY_QUEUE);
    expect(html).not.toContain(QUEUE_LABEL);
    expect(html).not.toContain(DETAIL_LABEL);
  });
});
