import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";

import { DeletedCaseScreen } from "@/domains/cases/components/deleted-case-screen";
import {
  deletedCaseBySlugQuery,
  deletionPolicyQuery,
} from "@/domains/cases/queries";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { RouteNotFoundCenter } from "@/shared/layout/route-not-found-center";
import { normalizeEntitySlug } from "@/shared/lib/route-slug";
import { InlineLoading } from "@/shared/ui/inline-loading";
import { Button } from "@/shared/ui/primitives/button";

const routeApi = getRouteApi("/_protected/cases/$caseSlug");

/**
 * The Case route's not-found screen (loaded on demand: a missing Case is rare, so its code
 * stays out of every Case route's download). No visible Case has this slug. An owner or admin
 * may be looking at a deleted Case, so they get the "deleted on X by Y" screen with Restore;
 * everyone else (and any slug that is no deleted Case) gets the ordinary not-found screen,
 * which never says a deleted Case exists.
 */
export function CaseNotFound() {
  const { caseSlug: rawCaseSlug } = routeApi.useParams();
  const caseSlug = normalizeEntitySlug(rawCaseSlug) ?? rawCaseSlug;
  const policy = useQuery(deletionPolicyQuery());
  const deletedOptions = deletedCaseBySlugQuery(caseSlug);
  // A slug that cannot name a Case is never looked up: do not wait for an answer that cannot come.
  const isLookupEnabled =
    policy.data?.canManage === true && deletedOptions.enabled;
  const deleted = useQuery({ ...deletedOptions, enabled: isLookupEnabled });

  if (policy.isPending || (isLookupEnabled && deleted.isPending)) {
    return (
      <Page className="min-h-0">
        <PageHeader current="Case" />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <InlineLoading label="Looking for this Case…" />
        </div>
      </Page>
    );
  }

  if (deleted.data) return <DeletedCaseScreen deleted={deleted.data} />;

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
