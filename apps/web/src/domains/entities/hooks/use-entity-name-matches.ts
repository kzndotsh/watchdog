import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { entityNameMatchesQuery } from "@/domains/entities/queries";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { ENTITY_NAME_LOOKUP_MAX } from "@watchdog/schemas/graph";

const NO_ENTITIES: readonly EntityOption[] = [];

/** Unique names in a stable order, in batches of at most `ENTITY_NAME_LOOKUP_MAX`. */
function nameBatches(names: readonly string[]): string[][] {
  const unique = [...new Set(names)].sort();
  const batches: string[][] = [];
  for (let start = 0; start < unique.length; start += ENTITY_NAME_LOOKUP_MAX) {
    batches.push(unique.slice(start, start + ENTITY_NAME_LOOKUP_MAX));
  }
  return batches;
}

/**
 * The Case's Entities that pasted names may mean, looked up on the server a batch at a time
 * (#573: the bulk add never reads the whole Entity list). `isPending` until every batch has
 * answered; `isEnabled` false asks nothing.
 */
export function useEntityNameMatches(
  caseId: string,
  names: readonly string[],
  isEnabled: boolean
): { entities: readonly EntityOption[]; isPending: boolean } {
  const namesKey = names.join("\n");
  const batches = useMemo(
    () => (isEnabled ? nameBatches(namesKey.split("\n").filter(Boolean)) : []),
    [namesKey, isEnabled]
  );
  return useQueries({
    queries: batches.map((batch) => entityNameMatchesQuery(caseId, batch)),
    combine: (results) => ({
      entities: results.flatMap((result) => result.data ?? NO_ENTITIES),
      isPending: results.some((result) => result.data === undefined),
    }),
  });
}
