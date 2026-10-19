import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { entitiesListQuery } from "@/domains/entities/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import { jobsListQuery } from "@/domains/jobs/queries";
import { buildCaseRecord } from "@/testing/records";
import { RouteCaseProvider } from "@/testing/route-case";

vi.mock("@watchdog/ui/components/sidebar", () => ({
  SidebarTrigger: () => <button type="button">Menu</button>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  Navigate: () => null,
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/" }, matches: [] }),
}));

import { Collect } from "@/domains/collect/components/collect";

// Collect renders on the server first (a refresh). Nothing is fetched there, so a queue
// that has not settled must paint its skeleton; "no items" is for a settled, empty queue.

const CASE = buildCaseRecord();
const QUEUE_LABEL = "Loading collect queue";
const DETAIL_LABEL = "Loading collect detail";
const EMPTY_QUEUE = "Dump evidence or run a Cap/Playbook.";

function serverRender(client: QueryClient): string {
  return renderToString(
    <QueryClientProvider client={client}>
      <RouteCaseProvider routeCase={CASE}>
        <Collect urlId={undefined} onIdChange={vi.fn()} />
      </RouteCaseProvider>
    </QueryClientProvider>
  );
}

describe("Collect loading", () => {
  it("server-renders the queue and detail skeletons while pending, never the empty queue", () => {
    const html = serverRender(new QueryClient());

    expect(html).toContain(QUEUE_LABEL);
    expect(html).toContain(DETAIL_LABEL);
    expect(html).not.toContain(EMPTY_QUEUE);
  });

  it("shows the empty queue once every list has settled empty", () => {
    const client = new QueryClient();
    client.setQueryData(evidenceListQuery(CASE.id).queryKey, []);
    client.setQueryData(
      evidenceListQuery(CASE.id, { isHiddenOnly: true }).queryKey,
      []
    );
    client.setQueryData(jobsListQuery(CASE.id).queryKey, []);
    client.setQueryData(entitiesListQuery(CASE.id).queryKey, []);

    const html = serverRender(client);

    expect(html).toContain(EMPTY_QUEUE);
    expect(html).not.toContain(QUEUE_LABEL);
    expect(html).not.toContain(DETAIL_LABEL);
  });
});
