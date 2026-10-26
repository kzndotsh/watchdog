import { queryOptions } from "@tanstack/react-query";

import { entitiesKeys } from "@/domains/entities/entities-keys";
import {
  getEntitiesFn,
  getEntityBySlugFn,
  listEntitiesFn,
  listEntitiesPageFn,
} from "@/domains/entities/entities.functions";
import type { EntityListItem, EntityRecord } from "@/domains/entities/types";
import type { PickerPort, PickerQuery } from "@/shared/hooks/use-picker-source";
import { listView } from "@/shared/lib/list/list-view";
import {
  parseCaseIdInput,
  parseCaseSlugInput,
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeCaseSlug,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { entityList } from "@watchdog/schemas/graph";
import type { EntityKind } from "@watchdog/schemas/shared";

export { entitiesKeys } from "@/domains/entities/entities-keys";

export const entitiesListQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = entitiesKeys.all(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listEntitiesFn({ data: parseCaseIdInput(scopedCaseId) }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/** The scope of the Case's Entity list: one per Case. */
export type EntityListScope = { readonly caseId: string };

/**
 * The Case's Entity list (`entityList`, ADR-0007), a page at a time: the Entities table. Each row
 * carries its Connection counts and its one Connection. Keys sit under `entitiesKeys.all`, so
 * every Entity and Connection invalidation refreshes each open view.
 */
export const entityListView = listView(entityList, {
  domain: "entities",
  scopeKey: ({ caseId }: EntityListScope) => [scopeCaseId(caseId)],
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  fetchPage: async ({ scope, params, cursor }) =>
    listEntitiesPageFn({
      data: {
        ...params,
        caseId: scopeCaseId(scope.caseId),
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  getId: (row: EntityListItem) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});

export const entityBySlugQuery = (caseId: string, slug: string) => {
  const { scoped, enabled } = scopeCaseSlug(caseId, slug);
  const queryKey = entitiesKeys.detail(scoped.caseId, scoped.slug);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      getEntityBySlugFn({
        data: parseCaseSlugInput(scoped.caseId, scoped.slug),
      }),
    enabled,
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/** One picker page: small, so a picker never reads more than this many rows per request. */
const ENTITY_PICKER_LIMIT = 20;

function entityOptionOf(row: EntityRecord): EntityOption {
  return { id: row.id, name: row.name, kind: row.kind, slug: row.slug };
}

/**
 * The Entity pickers' reads (#559): one page of the Case's Entity list, most recently updated
 * first when `q` is null, else its server search (name, summary, notes), optionally narrowed to
 * `kinds`; records by id through `entities.getMany`. Keys sit under `entitiesKeys.all`.
 */
export function entityPickerPort(
  caseId: string,
  { kinds = [] }: { readonly kinds?: readonly EntityKind[] } = {}
): PickerPort<EntityOption> {
  const scopedCaseId = scopeCaseId(caseId);
  const enabled = scopeCaseIdEnabled(caseId);
  const kindList = [...kinds].sort();
  return {
    search: (q): PickerQuery<EntityOption> => ({
      queryKey: [
        ...entitiesKeys.all(scopedCaseId),
        "picker",
        q ?? "",
        kindList.join(","),
      ],
      queryFn: async () => {
        const page = await listEntitiesPageFn({
          data: {
            caseId: scopedCaseId,
            limit: ENTITY_PICKER_LIMIT,
            ...(q === null ? { sort: "updated.desc" } : { q }),
            ...(kindList.length === 0 ? {} : { kind: kindList }),
          },
        });
        return page.items.map(entityOptionOf);
      },
      enabled,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    }),
    byIds: (ids): PickerQuery<EntityOption> => ({
      queryKey: [...entitiesKeys.all(scopedCaseId), "by-ids", ...ids],
      queryFn: async () => {
        const rows = await getEntitiesFn({
          data: { caseId: scopedCaseId, ids: [...ids] },
        });
        return rows.map(entityOptionOf);
      },
      enabled: enabled && ids.length > 0,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    }),
  };
}
