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

/** A row of the Entity list: the Entity with its Connection counts and its one Connection. */
export type EntityListItem = CoreEntityListItem;

/** A listed Entity's Connection, seen from it (an Edge without its Evidence links). */
export type EntityListConnection = CoreEntityListConnection;

export type CaseIdInput = CaseScopeInput;

export type CaseSlugInput = EntitySlugScopeInput;

export type CreateEntityInput = z.output<typeof createEntityInputSchema>;

export type UpdateEntityFieldsInput = UpdateEntityInput;
