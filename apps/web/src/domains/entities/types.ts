import type { z } from "zod";

import type {
  EntityListConnection as CoreEntityListConnection,
  EntityListItem as CoreEntityListItem,
  EntityRecord as CoreEntityRecord,
} from "@watchdog/core/graph";
import type {
  createEntityInputSchema,
  CaseScopeInput,
  EntitySlugScopeInput,
  UpdateEntityInput,
} from "@watchdog/schemas/graph";

export type EntityRecord = CoreEntityRecord;

/**
 * Case + Entity a Graph child write (a Claim, Connection, Event, Open Question or Identifier of
 * the Entity) was started for. Mutations take it in their variables, never in hook props: props
 * follow re-renders (an Active Case switch) and would redirect the invalidation of a pending write.
 */
export type EntityScope = {
  caseId: string;
  entityId: string;
  /** Entity slug for the detail cache key. */
  entitySlug: string;
};

/** A row of the Entity list: the Entity with its Connection counts and its one Connection. */
export type EntityListItem = CoreEntityListItem;

/** A listed Entity's Connection, seen from it (an Edge without its Evidence links). */
export type EntityListConnection = CoreEntityListConnection;

export type CaseIdInput = CaseScopeInput;

export type CaseSlugInput = EntitySlugScopeInput;

export type CreateEntityInput = z.output<typeof createEntityInputSchema>;

export type UpdateEntityFieldsInput = UpdateEntityInput;
