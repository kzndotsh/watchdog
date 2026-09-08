import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";

import { casesContextQuery } from "@/domains/cases/queries";
import { entityBySlugQuery } from "@/domains/entities/queries";
import { buildPageTrail, type TrailItem } from "@/shared/layout/page-trail";
import { listPending } from "@/shared/lib/list-pending";
import { queryEnabledFlag } from "@/shared/lib/query-enabled";
import { queryLoadError } from "@/shared/lib/query-load-error";
import { normalizeEntitySlug } from "@/shared/lib/route-slug";

function trailParams(matches: readonly { params: Record<string, unknown> }[]): {
  caseSlug?: string;
  entitySlug?: string;
} {
  const merged: { caseSlug?: string; entitySlug?: string } = {};
  for (const { params } of matches) {
    if (typeof params.caseSlug === "string") {
      const scoped = normalizeEntitySlug(params.caseSlug);
      if (scoped !== undefined) merged.caseSlug = scoped;
    }
    if (typeof params.entitySlug === "string") {
      const scoped = normalizeEntitySlug(params.entitySlug);
      if (scoped !== undefined) merged.entitySlug = scoped;
    }
  }
  return merged;
}

export function usePageTrail(): {
  items: TrailItem[];
  pendingLast: boolean;
  placeholderLast: boolean;
  errorLast: boolean;
} {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useRouterState({
    select: (s) => trailParams(s.matches),
  });

  const casesQuery = useQuery({
    ...casesContextQuery(),
    meta: { silentError: true },
  });
  const casesPending = listPending(casesQuery);
  const casesLoadError =
    queryLoadError(casesQuery, casesPending, "Failed to load cases") !== null;
  const activeCase = casesLoadError ? null : (casesQuery.data?.active ?? null);
  const routeCase =
    casesLoadError || params.caseSlug === undefined
      ? null
      : (casesQuery.data?.cases.find((row) => row.slug === params.caseSlug) ??
        (activeCase?.slug === params.caseSlug ? activeCase : null));

  const entityQueryOptions = entityBySlugQuery(
    activeCase?.id ?? "",
    params.entitySlug ?? ""
  );
  const entityQueryEnabled =
    queryEnabledFlag(entityQueryOptions.enabled) &&
    Boolean(activeCase?.id && params.entitySlug);

  const entityQuery = useQuery({
    ...entityQueryOptions,
    enabled: entityQueryEnabled,
    meta: { silentError: true },
  });

  const entityPending = listPending(entityQuery, {
    enabled: entityQueryEnabled,
  });
  const entityLoadError = Boolean(
    activeCase?.id &&
    params.entitySlug &&
    queryLoadError(entityQuery, entityPending, "Failed to load entity") !== null
  );

  let items = buildPageTrail({
    pathname,
    activeCase,
    routeCase,
    entity: entityQuery.data ?? null,
  });
  if (casesLoadError) {
    const last = items.at(-1);
    if (last?.id === "case" || last?.id === "entity") {
      items = [...items.slice(0, -1), { ...last, label: "Unavailable" }];
    }
  }
  if (entityLoadError) {
    const last = items.at(-1);
    if (last?.id === "entity") {
      items = [...items.slice(0, -1), { ...last, label: "Unavailable" }];
    }
  }

  const errorLast =
    entityLoadError ||
    (casesLoadError &&
      (items.at(-1)?.id === "case" || items.at(-1)?.id === "entity"));

  const pendingLast = entityQueryEnabled && entityPending && !entityQuery.data;

  return {
    items,
    pendingLast,
    placeholderLast: entityQuery.isPlaceholderData,
    errorLast,
  };
}
