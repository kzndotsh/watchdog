import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
} from "@tanstack/react-router";

import { Dossier } from "@/domains/dossier/components/dossier";
import { validateDossierSearch } from "@/domains/dossier/lib/dossier-tabs";
import { warmDossierQueries } from "@/domains/dossier/lib/prefetch-dossier";
import { entityBySlugQuery } from "@/domains/entities/queries";
import { usePatchSearch } from "@/shared/hooks/list/use-patch-search";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { RouteError } from "@/shared/layout/route-error";
import { normalizeEntitySlug } from "@/shared/lib/route-slug";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { Button } from "@/shared/ui/primitives/button";

const routeApi = getRouteApi(
  "/_protected/cases/$caseSlug/entities/$entitySlug"
);

function notFoundCaseName(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("caseName" in data)) {
    return undefined;
  }
  return typeof data.caseName === "string" ? data.caseName : undefined;
}

function EntityNotFound({ data }: { data?: unknown }) {
  const { entitySlug: rawEntitySlug, caseSlug } = routeApi.useParams();
  const entitySlug = normalizeEntitySlug(rawEntitySlug) ?? rawEntitySlug;
  const caseName = notFoundCaseName(data) ?? "this Case";

  return (
    <Page>
      <PageHeader
        current="Not found"
        description={
          <>
            No Entity <code>{entitySlug}</code> in Case &quot;{caseName}&quot;.
          </>
        }
      />
      <Button
        nativeButton={false}
        render={<Link to="/cases/$caseSlug/entities" params={{ caseSlug }} />}
      >
        Back to Entities
      </Button>
    </Page>
  );
}

function DossierPage() {
  const { entitySlug: rawEntitySlug } = routeApi.useParams();
  const entitySlug = normalizeEntitySlug(rawEntitySlug);
  if (entitySlug === undefined) {
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
    throw notFound();
  }
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const onSearchChange = usePatchSearch();
  return (
    <Dossier
      entitySlug={entitySlug}
      search={search}
      onSearchChange={onSearchChange}
      onTabChange={(next) => {
        // A list's view belongs to its tab: another tab starts at its own default view.
        void navigate({ search: { tab: next }, replace: true });
      }}
    />
  );
}

export const Route = createFileRoute(
  "/_protected/cases/$caseSlug/entities/$entitySlug"
)({
  validateSearch: validateDossierSearch,
  // Path params rematch on their own; return stable deps so `?tab=`, a list view or the
  // selected Evidence (`?id=`) never re-runs the loader.
  loaderDeps: () => ({}),
  loader: async ({ context: { queryClient, workCase }, params }) => {
    const entitySlug = normalizeEntitySlug(params.entitySlug);
    if (entitySlug === undefined) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
      throw notFound();
    }

    // Block only on the entity — shell (title / tabs) can paint from this.
    const entity = await ensureAppQueryData(
      queryClient,
      entityBySlugQuery(workCase.id, entitySlug)
    );
    if (!entity) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
      throw notFound({ data: { caseName: workCase.name } });
    }

    // Intent preload / navigation: warm tab data without delaying paint.
    warmDossierQueries(queryClient, workCase.id, entity.id);
  },
  // No pendingComponent — keep previous page until entity is ready; dossier sections load inline.
  errorComponent: RouteError,
  notFoundComponent: EntityNotFound,
  component: DossierPage,
});
