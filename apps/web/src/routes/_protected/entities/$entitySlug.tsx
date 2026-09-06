import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
} from "@tanstack/react-router";
import { z } from "zod";

import { casesContextQuery } from "@/domains/cases/queries";
import { Dossier } from "@/domains/dossier/components/dossier";
import { warmDossierQueries } from "@/domains/dossier/lib/prefetch-dossier";
import { entityBySlugQuery } from "@/domains/entities/queries";
import { Page, PageHeader } from "@/shared/layout/page";
import { RouteError } from "@/shared/layout/route-error";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { Button } from "@/shared/ui/shadcn/button";

const routeApi = getRouteApi("/_protected/entities/$entitySlug");

const dossierTabs = [
  "overview",
  "notes",
  "claims",
  "identifiers",
  "connections",
  "evidence",
  "events",
  "questions",
  "tasks",
] as const;

type DossierPrefetchTab = (typeof dossierTabs)[number];

function isDossierPrefetchTab(value: string): value is DossierPrefetchTab {
  return (dossierTabs as readonly string[]).includes(value);
}

function parseTab(value: unknown): DossierPrefetchTab {
  if (typeof value === "string" && isDossierPrefetchTab(value)) {
    return value;
  }
  return "overview";
}

function notFoundCaseName(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("caseName" in data)) {
    return undefined;
  }
  return typeof data.caseName === "string" ? data.caseName : undefined;
}

function EntityNotFound({ data }: { data?: unknown }) {
  const { entitySlug } = routeApi.useParams();
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
      <Button nativeButton={false} render={<Link to="/entities" />}>
        Back to Entities
      </Button>
    </Page>
  );
}

function DossierPage() {
  const { entitySlug } = routeApi.useParams();
  const { tab } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  return (
    <Dossier
      entitySlug={entitySlug}
      tab={tab}
      onTabChange={(next) => {
        void navigate({
          search: (prev) => ({ ...prev, tab: next }),
          replace: true,
        });
      }}
    />
  );
}

export const Route = createFileRoute("/_protected/entities/$entitySlug")({
  validateSearch: z.object({ tab: z.string().optional() }),
  // Path params rematch on their own; return stable deps so `?tab=` doesn't re-run the loader.
  loaderDeps: () => ({}),
  loader: async ({ context: { queryClient }, params, location }) => {
    const { active } = await ensureAppQueryData(
      queryClient,
      casesContextQuery()
    );
    if (!active) return;

    // Block only on the entity — shell (title / tabs) can paint from this.
    const entity = await ensureAppQueryData(
      queryClient,
      entityBySlugQuery(active.id, params.entitySlug)
    );
    if (!entity) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
      throw notFound({ data: { caseName: active.name } });
    }

    // Intent preload / navigation: warm tab data without delaying paint.
    const search: unknown = location.search;
    const tab =
      typeof search === "object" && search !== null && "tab" in search
        ? parseTab(search.tab)
        : "overview";
    warmDossierQueries(queryClient, active.id, entity.id, tab);
  },
  // No pendingComponent — keep previous page until entity is ready; body Suspense fills data.
  errorComponent: RouteError,
  notFoundComponent: EntityNotFound,
  component: DossierPage,
});
