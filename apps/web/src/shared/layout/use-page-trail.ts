import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";

import { entityBySlugQuery } from "@/domains/entities/queries";
import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
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

/** The kind and id of a Library entry page (`/library/caps/x`, `/library/playbooks/x`), else null. */
function libraryEntryRef(
  pathname: string
): { kind: "caps" | "playbooks"; id: string } | null {
  const [head, kind, id] = pathname.split("/").filter(Boolean);
  if (head !== "library" || id === undefined) return null;
  if (kind !== "caps" && kind !== "playbooks") return null;
  return { kind, id: decodeURIComponent(id) };
}

/** The context's Case while it is the one the URL names, else `null`. */
function sameSlugCase<T extends { slug: string }>(
  found: T | null,
  slug: string | undefined
): T | null {
  return found !== null && found.slug === slug ? found : null;
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
  const routeCase = sameSlugCase(useRouteCase(), params.caseSlug);

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

  // A Library entry's title, from the catalog reads its page already made.
  const libraryRef = libraryEntryRef(pathname);
  const capsQuery = useQuery({
    ...capabilitiesListQuery(),
    enabled: libraryRef?.kind === "caps",
    meta: { silentError: true },
  });
  const playbooksQuery = useQuery({
    ...playbooksListQuery(),
    enabled: libraryRef?.kind === "playbooks",
    meta: { silentError: true },
  });
  const libraryList =
    libraryRef?.kind === "caps" ? capsQuery.data : playbooksQuery.data;
  const libraryEntry =
    libraryRef === null
      ? undefined
      : libraryList?.find((row) => row.id === libraryRef.id);

  let items = buildPageTrail({
    pathname,
    routeCase,
    entity: entityQuery.data ?? null,
    libraryEntry: libraryEntry ?? null,
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
