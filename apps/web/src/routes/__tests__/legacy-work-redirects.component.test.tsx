// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Only the network boundary is faked; the redirects run through a real router.
vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  healActiveCaseFn: vi.fn(async () => ({ changed: false })),
}));

import { casesKeys } from "@/domains/cases/queries";
import { Route as casesLayout } from "@/routes/_protected/cases/$caseSlug";
import { Route as collect } from "@/routes/_protected/collect/index";
import { Route as dossier } from "@/routes/_protected/entities/$entitySlug";
import { Route as entities } from "@/routes/_protected/entities/index";
import { Route as graph } from "@/routes/_protected/graph/index";
import { Route as identifiers } from "@/routes/_protected/identifiers/index";
import { Route as tasks } from "@/routes/_protected/tasks/index";
import { Route as triage } from "@/routes/_protected/triage/index";
import { mountFileRoute } from "@/testing/mount-file-route";
import { buildCaseRecord } from "@/testing/records";
import { testId } from "@watchdog/test-kit";

const ALPHA = buildCaseRecord();

/** The cases-context cache the protected layout warms: `active` is the cookie's Case. */
function clientWithActive(active: typeof ALPHA | null) {
  const client = new QueryClient();
  client.setQueryData(casesKeys.context(), {
    cases: active ? [active] : [],
    active,
  });
  client.setQueryData(casesKeys.detail(ALPHA.id), ALPHA);
  client.setQueryData(casesKeys.bySlug(ALPHA.slug), ALPHA);
  return client;
}

/**
 * A router with the real old-URL routes and stand-ins for their slugged targets, opened
 * at `href`. The stand-ins accept any search (the real screens validate their own).
 */
async function openLegacy(href: string, active: typeof ALPHA | null = ALPHA) {
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()();
  const anySearch = { validateSearch: z.record(z.string(), z.unknown()) };
  const legacy = [
    ["/collect", collect],
    ["/triage", triage],
    ["/tasks", tasks],
    ["/graph", graph],
    ["/identifiers", identifiers],
    ["/entities", entities],
    ["/entities/$entitySlug", dossier],
  ] as const;
  const legacyRoutes = legacy.map(([path, route]) =>
    mountFileRoute(route, { id: path, path, getParentRoute: () => root })
  );
  const targets = [
    "/cases/$caseSlug/collect",
    "/cases/$caseSlug/triage",
    "/cases/$caseSlug/tasks",
    "/cases/$caseSlug/graph",
    "/cases/$caseSlug/identifiers",
    "/cases/$caseSlug/entities",
    "/cases/$caseSlug/entities/$entitySlug",
    "/cases",
  ].map((path) =>
    createRoute({ getParentRoute: () => root, path, ...anySearch })
  );
  const router = createRouter({
    routeTree: root.addChildren([...legacyRoutes, ...targets]),
    history: createMemoryHistory({ initialEntries: [href] }),
    context: { queryClient: clientWithActive(active) },
  });
  await router.load();
  return router.state.location;
}

describe("Case-less Work URLs redirect to the slugged URL", () => {
  it("/collect keeps a Job id in the query string", async () => {
    const jobId = testId(77);
    const location = await openLegacy(`/collect?id=${jobId}`);
    expect(location.pathname).toBe("/cases/alpha/collect");
    expect(location.search).toEqual({ id: jobId });
  });

  it("/triage keeps a Proposal id and status in the query string", async () => {
    const proposalId = testId(78);
    const location = await openLegacy(
      `/triage?proposalId=${proposalId}&status=pending`
    );
    expect(location.pathname).toBe("/cases/alpha/triage");
    expect(location.search).toEqual({ proposalId, status: "pending" });
  });

  it("/tasks keeps its filters", async () => {
    const entityId = testId(79);
    const location = await openLegacy(`/tasks?entityId=${entityId}`);
    expect(location.pathname).toBe("/cases/alpha/tasks");
    expect(location.search).toEqual({ entityId });
  });

  it.each(["graph", "identifiers", "entities"])(
    "/%s goes to that screen of the Active Case",
    async (screen) => {
      const location = await openLegacy(`/${screen}`);
      expect(location.pathname).toBe(`/cases/alpha/${screen}`);
    }
  );

  it("/entities/$entitySlug keeps the entity slug and the tab", async () => {
    const location = await openLegacy("/entities/ada-lovelace?tab=claims");
    expect(location.pathname).toBe("/cases/alpha/entities/ada-lovelace");
    expect(location.search).toEqual({ tab: "claims" });
  });

  it("uses the cookie's Case, whichever Case that is", async () => {
    const beta = buildCaseRecord({
      id: testId(11) as typeof ALPHA.id,
      slug: "beta",
    });
    const location = await openLegacy("/collect", beta);
    expect(location.pathname).toBe("/cases/beta/collect");
  });

  it("with no Active Case there is no Case to open, so it lands on the Cases list", async () => {
    const location = await openLegacy("/collect?id=x", null);
    expect(location.pathname).toBe("/cases");
  });
});

describe("the legacy /cases/$caseId (uuid) URL", () => {
  it("redirects to the Case's slug", async () => {
    const root = createRootRouteWithContext<{ queryClient: QueryClient }>()();
    const layout = mountFileRoute(casesLayout, {
      id: "/cases/$caseSlug",
      path: "/cases/$caseSlug",
      getParentRoute: () => root,
    });
    const router = createRouter({
      routeTree: root.addChildren([layout]),
      history: createMemoryHistory({
        initialEntries: [`/cases/${ALPHA.id}`],
      }),
      context: { queryClient: clientWithActive(ALPHA) },
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/cases/alpha");
  });
});
