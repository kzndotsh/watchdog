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
import {
  normalizeEntitySlug,
  normalizeRouteSegment,
} from "@/shared/lib/route-slug";
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

function parseEntitySearchTab(value: unknown): DossierPrefetchTab | undefined {
  const slug =
    typeof value === "string" ? normalizeRouteSegment(value) : undefined;
  if (slug !== undefined && isDossierPrefetchTab(slug)) {
    return slug;
  }
  return undefined;
}

function parseTab(value: unknown): DossierPrefetchTab {
  return parseEntitySearchTab(value) ?? "overview";
}

const entitySearchSchema = z.object({
  tab: z.unknown().transform(parseEntitySearchTab).optional(),
});

function notFoundCaseName(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("caseName" in data)) {
    return undefined;
  }
  return typeof data.caseName === "string" ? data.caseName : undefined;
}

function EntityNotFound({ data }: { data?: unknown }) {
  const { entitySlug: rawEntitySlug } = routeApi.useParams();
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
      <Button nativeButton={false} render={<Link to="/entities" />}>
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
  validateSearch: entitySearchSchema,
  // Path params rematch on their own; return stable deps so `?tab=` doesn't re-run the loader.
  loaderDeps: () => ({}),
  loader: async ({ context: { queryClient }, params, location }) => {
    const entitySlug = normalizeEntitySlug(params.entitySlug);
    if (entitySlug === undefined) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's notFound() throws a plain object, per docs
      throw notFound();
    }

    const { active } = await ensureAppQueryData(
      queryClient,
      casesContextQuery()
    );
    if (!active) return;

    // Block only on the entity — shell (title / tabs) can paint from this.
    const entity = await ensureAppQueryData(
      queryClient,
      entityBySlugQuery(active.id, entitySlug)
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
  // No pendingComponent — keep previous page until entity is ready; dossier sections load inline.
  errorComponent: RouteError,
  notFoundComponent: EntityNotFound,
  component: DossierPage,
});
