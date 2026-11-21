import { queryOptions } from "@tanstack/react-query";

import { entitiesKeys } from "@/domains/entities/entities-keys";
import type { EntityListItem, EntityRecord } from "@/domains/entities/types";
import { orpc } from "@/lib/orpc-client";
import { orpcNullIfNotFound } from "@/lib/orpc-null-if-not-found";
import type { PickerPort, PickerQuery } from "@/shared/hooks/use-picker-source";
import { listView } from "@/shared/lib/list/list-view";
import {
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeCaseSlug,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { normalizeEntitySlug } from "@/shared/lib/route-slug";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { entityList } from "@watchdog/domain/schemas/graph";
import type { EntityKind } from "@watchdog/domain/schemas/shared";

export { entitiesKeys } from "@/domains/entities/entities-keys";

/** The scope of the Case's Entity list: one per Case. */
export type EntityListScope = { readonly caseId: string };

/**
 * The Case's Entity list (`entityList`, ADR-0007), a page at a time through `entities.list`: the
 * Entities table. Each row carries its Connection counts and its one Connection. Keys sit under
 * `entitiesKeys.all`, so every Entity and Connection invalidation refreshes each open view.
 */
export const entityListView = listView(entityList, {
  procedure: orpc.entities.list,
  scopeInput: ({ caseId }: EntityListScope) => ({
    caseId: scopeCaseId(caseId),
  }),
  input: ({ scope, params, cursor }) => ({
    ...params,
    caseId: scopeCaseId(scope.caseId),
    ...(cursor === undefined ? {} : { cursor }),
  }),
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  getId: (row: EntityListItem) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});

/** One Entity by slug (`entities.get`), or null for a slug that names no Entity of the Case. */
export const entityBySlugQuery = (caseId: string, slug: string) => {
  const { scoped, enabled } = scopeCaseSlug(caseId, slug);
  const queryKey = entitiesKeys.detail(scoped.caseId, scoped.slug);
  return queryOptions({
    queryKey,
    queryFn: async (): Promise<EntityRecord | null> => {
      const normalized = normalizeEntitySlug(scoped.slug);
      if (normalized === undefined) return null;
      return orpcNullIfNotFound(
        orpc.entities.get.call({ caseId: scoped.caseId, slug: normalized })
      );
    },
    enabled,
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/** One picker page: small, so a picker never reads more than this many rows per request. */
const ENTITY_PICKER_LIMIT = 20;

function entityOptionOf(
  row: Pick<EntityRecord, "id" | "name" | "kind" | "slug">
): EntityOption {
  return { id: row.id, name: row.name, kind: row.kind, slug: row.slug };
}

/**
 * The Entity pickers' reads (#559): one page of the Case's Entity list (`entities.pickerPage`),
 * most recently updated first when `q` is null, else its server search (name, summary, notes),
 * optionally narrowed to `kinds`; records by id through `entities.getMany`. Keys sit under
 * `entitiesKeys.all`.
 */
export function entityPickerPort(
  caseId: string,
  { kinds = [] }: { readonly kinds?: readonly EntityKind[] } = {}
): PickerPort<EntityOption> {
  const scopedCaseId = scopeCaseId(caseId);
  const enabled = scopeCaseIdEnabled(caseId);
  const kindList = [...kinds].sort();
  return {
    search: (q): PickerQuery<EntityOption> => {
      const input = {
        caseId: scopedCaseId,
        limit: ENTITY_PICKER_LIMIT,
        ...(q === null ? { sort: "updated.desc" as const } : { q }),
        ...(kindList.length === 0 ? {} : { kind: kindList }),
      };
      return {
        queryKey: orpc.entities.pickerPage.key({ type: "query", input }),
        queryFn: async () => {
          const page = await orpc.entities.pickerPage.call(input);
          return page.items.map(entityOptionOf);
        },
        enabled,
        staleTime: STALE_DEFAULT,
        gcTime: GC_DEFAULT,
      };
    },
    byIds: (ids): PickerQuery<EntityOption> => {
      const input = { caseId: scopedCaseId, ids: [...ids] };
      return {
        queryKey: orpc.entities.getMany.key({ type: "query", input }),
        queryFn: async () => {
          const rows = await orpc.entities.getMany.call(input);
          return rows.map(entityOptionOf);
        },
        enabled: enabled && ids.length > 0,
        staleTime: STALE_DEFAULT,
        gcTime: GC_DEFAULT,
      };
    },
  };
}

/**
 * The Case's Entities that a batch of pasted names may mean (the Identifiers bulk add), at most
 * `ENTITY_NAME_LOOKUP_MAX` names (`entities.matchNames`): the server matches name or slug, the
 * caller applies its rule (`matchPasteEntity`) to the rows. Keys sit under `entitiesKeys.all`.
 */
export const entityNameMatchesQuery = (
  caseId: string,
  names: readonly string[]
) => {
  const input = { caseId: scopeCaseId(caseId), names: [...names] };
  return queryOptions({
    queryKey: orpc.entities.matchNames.key({ type: "query", input }),
    queryFn: async (): Promise<EntityOption[]> => {
      const rows = await orpc.entities.matchNames.call(input);
      return rows.map(entityOptionOf);
    },
    enabled: scopeCaseIdEnabled(caseId) && names.length > 0,
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};
