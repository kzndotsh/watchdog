import type { QueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { z } from "zod";

import { setActiveCaseIdFn } from "@/domains/cases/cases.functions";
import { CaseOverview } from "@/domains/cases/components/case-overview";
import { getActiveCaseHealEpoch } from "@/domains/cases/lib/active-case";
import { warmCaseOverviewQueries } from "@/domains/cases/lib/prefetch-case-overview";
import {
  caseByIdQuery,
  caseBySlugQuery,
  casesContextQuery,
  casesKeys,
} from "@/domains/cases/queries";
import type { CaseRecord, CasesContext } from "@/domains/cases/types";
import { Page, PageHeader } from "@/shared/layout/page";
import { RouteError } from "@/shared/layout/route-error";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { Button } from "@/shared/ui/shadcn/button";
import { uuidSchema } from "@watchdog/schemas";

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

function CaseNotFound() {
  const { caseSlug } = routeApi.useParams();

  return (
    <Page>
      <PageHeader
        current="Not found"
        description={
          <>
            No Case with slug <code>{caseSlug}</code>.
          </>
        }
      />
      <Button nativeButton={false} render={<Link to="/cases" />}>
        Back to Cases
      </Button>
    </Page>
  );
}

function CaseOverviewPage() {
  const caseRow = routeApi.useLoaderData();
  return <CaseOverview caseId={caseRow.id} />;
}

function isCurrentOverviewSlug(caseSlug: string): boolean {
  if (typeof window === "undefined") return true;
  const path = window.location.pathname;
  return (
    path === `/cases/${caseSlug}` || path.startsWith(`/cases/${caseSlug}/`)
  );
}

function healAborted(epoch: number, caseSlug: string): boolean {
  return epoch !== getActiveCaseHealEpoch() || !isCurrentOverviewSlug(caseSlug);
}

/** Cookie follows `/cases/$slug`. Abort if a newer switch already moved Active Case. */
async function healActiveCaseToOverview(
  queryClient: QueryClient,
  caseRow: CaseRecord,
  caseSlug: string
): Promise<void> {
  if (!isCurrentOverviewSlug(caseSlug)) return;

  const epoch = getActiveCaseHealEpoch();
  const ctx = await ensureAppQueryData(queryClient, casesContextQuery());
  if (healAborted(epoch, caseSlug)) return;

  if (ctx.active?.id === caseRow.id) {
    return;
  }

  await setActiveCaseIdFn({ data: { caseId: caseRow.id } });
  if (healAborted(epoch, caseSlug)) return;

  await queryClient.invalidateQueries({
    queryKey: casesKeys.context(),
  });
  queryClient.setQueryData<CasesContext>(casesKeys.context(), (prev) =>
    prev ? { ...prev, active: caseRow } : prev
  );
}

export const Route = createFileRoute("/_protected/cases/$caseSlug")({
  validateSearch: z.object({ tab: z.string().optional() }),
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ context: { queryClient }, params, deps }) => {
    // Legacy bookmarks used /cases/$caseId — redirect to slug.
    if (uuidSchema.safeParse(params.caseSlug).success) {
      const byId = await ensureAppQueryData(
        queryClient,
        caseByIdQuery(params.caseSlug)
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
      caseBySlugQuery(params.caseSlug)
    );
    if (!caseRow) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
      throw notFound();
    }

    // Legacy overview tabs → first-class Active-Case routes.
    if (deps.tab && isLegacyTab(deps.tab)) {
      await healActiveCaseToOverview(queryClient, caseRow, params.caseSlug);
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() throws
      throw redirect({
        to: LEGACY_TAB_REDIRECT[deps.tab],
        replace: true,
      });
    }

    // Heal Active Case cookie to match the overview URL.
    await healActiveCaseToOverview(queryClient, caseRow, params.caseSlug);

    queryClient.setQueryData(caseByIdQuery(caseRow.id).queryKey, caseRow);
    warmCaseOverviewQueries(queryClient, caseRow.id);
    return caseRow;
  },
  errorComponent: RouteError,
  notFoundComponent: CaseNotFound,
  component: CaseOverviewPage,
});
