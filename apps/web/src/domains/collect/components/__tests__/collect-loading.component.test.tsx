import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { SidebarProvider } from "#ui/components/sidebar";
import { Collect } from "@/domains/collect/components/collect";
import { collectListView } from "@/domains/collect/queries";
import { buildCaseRecord } from "@/testing/records";
import { RouteCaseProvider } from "@/testing/route-case";
import { collectList } from "@watchdog/domain/schemas/jobs";

// The first paint of a queue that has not settled is its skeleton; "no items" is for a
// settled, empty queue.

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

/** The markup of the first render, before any fetch settles. */
function firstPaint(client: QueryClient): string {
  const { container, unmount } = render(
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
  const html = container.innerHTML;
  unmount();
  return html;
}

describe("Collect loading", () => {
  it("paints the queue and detail skeletons while pending, never the empty queue", () => {
    const html = firstPaint(new QueryClient());

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

    const html = firstPaint(client);

    expect(html).toMatch(EMPTY_QUEUE);
    expect(html).not.toContain(QUEUE_LABEL);
    expect(html).not.toContain(DETAIL_LABEL);
  });
});
