import type { QueryClient } from "@tanstack/react-query";

import { entitiesKeys } from "@/domains/entities/entities-keys";
import type { EntityRecord } from "@/domains/entities/types";
import { scopeCaseId } from "@/shared/lib/query-ingress";
import { parseOptionalTrimmedUuid } from "@watchdog/schemas";

/** Resolve entity-scoped invalidation opts for dossier detail + section lists. */
export function entityChangedOpts(
  queryClient: QueryClient,
  caseId: string,
  entityId: string,
  slug?: string
): { entityId: string; slug?: string } {
  const scopedEntityId = parseOptionalTrimmedUuid(entityId) ?? "";
  if (slug !== undefined && slug !== "") {
    return { entityId: scopedEntityId, slug };
  }
  const rows = queryClient.getQueryData<EntityRecord[]>(
    entitiesKeys.all(scopeCaseId(caseId))
  );
  const resolved = rows?.find((row) => row.id === scopedEntityId)?.slug;
  return resolved === undefined
    ? { entityId: scopedEntityId }
    : { entityId: scopedEntityId, slug: resolved };
}
