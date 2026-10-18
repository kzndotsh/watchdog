import {
  createFileRoute,
  notFound,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { getActiveCaseHealEpoch } from "@/domains/cases/lib/active-case";
import { healActiveCaseToRoute } from "@/domains/cases/lib/heal-active-case";
import { caseByIdQuery, caseBySlugQuery } from "@/domains/cases/queries";
import { RouteError } from "@/shared/layout/route-error";
import { normalizeEntitySlug } from "@/shared/lib/route-slug";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { parseTrimmedCaseId } from "@watchdog/schemas/shared";

const LoadedCaseNotFound = lazy(async () => {
  const mod = await import("@/domains/cases/components/case-not-found");
  return { default: mod.CaseNotFound };
});

/** The not-found screen is rare, so its code loads when a Case URL misses, not with the route. */
function CaseNotFound() {
  return (
    <Suspense fallback={null}>
      <LoadedCaseNotFound />
    </Suspense>
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
