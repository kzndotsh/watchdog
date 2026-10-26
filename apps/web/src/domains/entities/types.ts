import type { z } from "zod";

import type {
  EntityListConnection as CoreEntityListConnection,
  EntityListItem as CoreEntityListItem,
  EntityRecord as CoreEntityRecord,
} from "@watchdog/core/graph";
import {
  type createEntityInputSchema,
  caseScopeInputSchema,
  entitySlugScopeInputSchema,
  type CaseScopeInput,
  type EntitySlugScopeInput,
  type UpdateEntityInput,
} from "@watchdog/schemas/graph";

export type EntityRecord = CoreEntityRecord;

/** A row of the Entity list: the Entity with its Connection counts and its one Connection. */
export type EntityListItem = CoreEntityListItem;

/** A listed Entity's Connection, seen from it (an Edge without its Evidence links). */
export type EntityListConnection = CoreEntityListConnection;

export const caseIdInputSchema = caseScopeInputSchema;
export type CaseIdInput = CaseScopeInput;

export const caseSlugInputSchema = entitySlugScopeInputSchema;
export type CaseSlugInput = EntitySlugScopeInput;

export type CreateEntityInput = z.output<typeof createEntityInputSchema>;

export type UpdateEntityFieldsInput = UpdateEntityInput;
