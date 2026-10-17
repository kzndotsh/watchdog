import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";

import { entityBySlugQuery } from "@/domains/entities/queries";
import { useRouteCase } from "@/shared/hooks/use-route-case";
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
  isPendingLast: boolean;
  isPlaceholderLast: boolean;
  isErrorLast: boolean;
} {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useRouterState({
    select: (s) => trailParams(s.matches),
  });

  // The Case named by the URL: the shell's route-case context (set once its loader
  // resolved the slug); before that, the trail falls back to the slug text.
  const routeCaseRecord = useRouteCase();
  const routeCase =
    routeCaseRecord !== null && routeCaseRecord.slug === params.caseSlug
      ? routeCaseRecord
      : null;

  const entityQueryOptions = entityBySlugQuery(
    routeCase?.id ?? "",
    params.entitySlug ?? ""
  );
  const entityQueryEnabled =
    queryEnabledFlag(entityQueryOptions.enabled) &&
    Boolean(routeCase?.id && params.entitySlug);

  const entityQuery = useQuery({
    ...entityQueryOptions,
    enabled: entityQueryEnabled,
    meta: { silentError: true },
  });

  const entityPending = listPending(entityQuery, {
    isEnabled: entityQueryEnabled,
  });
  const entityLoadError = Boolean(
    routeCase?.id &&
    params.entitySlug &&
    queryLoadError(entityQuery, entityPending, "Failed to load entity") !== null
  );

  let items = buildPageTrail({
    pathname,
    routeCase,
    entity: entityQuery.data ?? null,
  });
  if (entityLoadError) {
    const last = items.at(-1);
    if (last?.id === "entity") {
      items = [...items.slice(0, -1), { ...last, label: "Unavailable" }];
    }
  }

  const errorLast = entityLoadError;

  const pendingLast = entityQueryEnabled && entityPending && !entityQuery.data;

  return {
    items,
    isPendingLast: pendingLast,
    isPlaceholderLast: entityQuery.isPlaceholderData,
    isErrorLast: errorLast,
  };
}
