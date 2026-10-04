import type { QueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { z } from "zod";

import { healActiveCaseFn } from "@/domains/cases/cases.functions";
import { CaseOverview } from "@/domains/cases/components/case-overview";
import { getActiveCaseHealEpoch } from "@/domains/cases/lib/active-case";
import { warmCaseOverviewQueries } from "@/domains/cases/lib/prefetch-case-overview";
import {
  caseByIdQuery,
  caseBySlugQuery,
  casesContextQuery,
} from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { Page, PageHeader } from "@/shared/layout/page";
import { RouteError } from "@/shared/layout/route-error";
import { RouteNotFoundCenter } from "@/shared/layout/route-not-found-center";
import { finalizeActiveCaseSwitch } from "@/shared/lib/active-case-switch";
import {
  normalizeEntitySlug,
  normalizeRouteSegment,
} from "@/shared/lib/route-slug";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { Button } from "@/shared/ui/primitives/button";
import { uuidSchema } from "@watchdog/schemas/shared";

const routeApi = getRouteApi("/_protected/cases/$caseSlug");

const LEGACY_TAB_REDIRECT = {
  entities: "/entities",
  identifiers: "/identifiers",
  graph: "/graph",
  tasks: "/tasks",
} as const;

type LegacyTab = keyof typeof LEGACY_TAB_REDIRECT;

function isLegacyTab(value: string): value is LegacyTab {
  return value in LEGACY_TAB_REDIRECT;
}

function parseLegacyTab(value: unknown): LegacyTab | undefined {
  const slug =
    typeof value === "string" ? normalizeRouteSegment(value) : undefined;
  if (slug !== undefined && isLegacyTab(slug)) {
    return slug;
  }
  return undefined;
}

const caseOverviewSearchSchema = z.object({
  tab: z
    .unknown()
    .transform((value) => parseLegacyTab(value))
    .optional(),
});

function CaseNotFound() {
  const { caseSlug: rawCaseSlug } = routeApi.useParams();
  const caseSlug = normalizeEntitySlug(rawCaseSlug) ?? rawCaseSlug;

  return (
    <Page className="min-h-0">
      <PageHeader
        current="Not found"
        description={
          <>
            No Case with slug <code>{caseSlug}</code>.
          </>
        }
      />
      <RouteNotFoundCenter
        title="Case not found"
        description="Check the slug, or head back to Cases to pick another."
      >
        <Button nativeButton={false} render={<Link to="/cases" />}>
          Back to Cases
        </Button>
      </RouteNotFoundCenter>
    </Page>
  );
}

function CaseOverviewPage() {
  const caseRow = routeApi.useLoaderData();
  return <CaseOverview caseId={caseRow.id} />;
}

/**
 * Cookie follows `/cases/$slug`. The server compare-and-sets (healActiveCaseFn): it writes
 * only while the cookie still holds the Active Case this loader observed. The client then
 * settles its caches through the shared switch helper. An intent preload never heals, and
 * a newer switch (epoch bump since the loader started) wins over a stale loader, both
 * before the call and after it.
 */
async function healActiveCaseToOverview(
  queryClient: QueryClient,
  caseRow: CaseRecord,
  preload: boolean,
  epoch: number
): Promise<void> {
  if (preload) return;

  const ctx = await ensureAppQueryData(queryClient, casesContextQuery());
  const observedActiveId = ctx.active?.id ?? null;
  if (observedActiveId === caseRow.id || epoch !== getActiveCaseHealEpoch()) {
    return;
  }

  const { changed } = await healActiveCaseFn({
    data: { caseId: caseRow.id, expectedActiveCaseId: observedActiveId },
  });
  if (!changed || epoch !== getActiveCaseHealEpoch()) return;

  await finalizeActiveCaseSwitch(queryClient, caseRow);
}

export const Route = createFileRoute("/_protected/cases/$caseSlug")({
  validateSearch: caseOverviewSearchSchema,
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ context: { queryClient }, params, deps, preload }) => {
    const epoch = getActiveCaseHealEpoch();
    const caseSlug = normalizeEntitySlug(params.caseSlug);
    if (caseSlug === undefined) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
      throw notFound();
    }

    // Legacy bookmarks used /cases/$caseId — redirect to slug.
    if (uuidSchema.safeParse(caseSlug).success) {
      const byId = await ensureAppQueryData(
        queryClient,
        caseByIdQuery(caseSlug)
      );
      if (!byId) {
        // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
        throw notFound();
      }
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() throws
      throw redirect({
        to: "/cases/$caseSlug",
        params: { caseSlug: byId.slug },
        search: deps.tab ? { tab: deps.tab } : {},
        replace: true,
      });
    }

    const caseRow = await ensureAppQueryData(
      queryClient,
      caseBySlugQuery(caseSlug)
    );
    if (!caseRow) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
      throw notFound();
    }

    // Legacy overview tabs → first-class Active-Case routes.
    if (deps.tab) {
      await healActiveCaseToOverview(queryClient, caseRow, preload, epoch);
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() throws
      throw redirect({
        to: LEGACY_TAB_REDIRECT[deps.tab],
        replace: true,
      });
    }

    // Heal Active Case cookie to match the overview URL.
    await healActiveCaseToOverview(queryClient, caseRow, preload, epoch);

    queryClient.setQueryData(caseByIdQuery(caseRow.id).queryKey, caseRow);
    warmCaseOverviewQueries(queryClient, caseRow.id);
    return caseRow;
  },
  errorComponent: RouteError,
  notFoundComponent: CaseNotFound,
  component: CaseOverviewPage,
});
