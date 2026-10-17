import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { getActiveCaseHealEpoch } from "@/domains/cases/lib/active-case";
import { healActiveCaseToRoute } from "@/domains/cases/lib/heal-active-case";
import { caseByIdQuery, caseBySlugQuery } from "@/domains/cases/queries";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { RouteError } from "@/shared/layout/route-error";
import { RouteNotFoundCenter } from "@/shared/layout/route-not-found-center";
import { normalizeEntitySlug } from "@/shared/lib/route-slug";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { Button } from "@/shared/ui/primitives/button";
import { parseTrimmedCaseId } from "@watchdog/schemas/shared";

const routeApi = getRouteApi("/_protected/cases/$caseSlug");

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

/**
 * The Case segment of every Work URL (`/cases/$caseSlug/...`). `beforeLoad` resolves the
 * slug against the organization's visible Cases, so a slug for a Case the caller cannot
 * see is Case not found, the same as an unknown slug. The Case it finds is route context
 * (`workCase`) for every child loader and, through `ProtectedLayout`, for every
 * component (`useRouteCase`); the Active Case cookie follows it.
 */
export const Route = createFileRoute("/_protected/cases/$caseSlug")({
  beforeLoad: async ({ context: { queryClient }, params, preload }) => {
    const epoch = getActiveCaseHealEpoch();
    const caseSlug = normalizeEntitySlug(params.caseSlug);
    if (caseSlug === undefined) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
      throw notFound();
    }

    // Legacy bookmarks used /cases/$caseId: redirect to the slug.
    const legacyCaseId = parseTrimmedCaseId(caseSlug);
    if (legacyCaseId !== null) {
      const byId = await ensureAppQueryData(
        queryClient,
        caseByIdQuery(legacyCaseId)
      );
      if (!byId) {
        // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
        throw notFound();
      }
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() throws
      throw redirect({
        to: "/cases/$caseSlug",
        params: { caseSlug: byId.slug },
        search: true,
        replace: true,
      });
    }

    const workCase = await ensureAppQueryData(
      queryClient,
      caseBySlugQuery(caseSlug)
    );
    if (!workCase) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
      throw notFound();
    }

    await healActiveCaseToRoute(queryClient, workCase, preload, epoch);
    queryClient.setQueryData(caseByIdQuery(workCase.id).queryKey, workCase);
    return { workCase };
  },
  errorComponent: RouteError,
  notFoundComponent: CaseNotFound,
  component: Outlet,
});
