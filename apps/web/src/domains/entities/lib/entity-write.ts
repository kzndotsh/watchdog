import {
  updateEntityFieldsInputSchema,
  type UpdateEntityFieldsInput,
} from "@/domains/entities/types";
import type { EntityKind } from "@watchdog/schemas";

export interface UpdateEntityFieldsPatch {
  entityId: string;
  kind?: EntityKind;
  name?: string;
  summary?: string | null;
  notes?: string | null;
}

/** Normalize entity field PATCH payloads at ingress. */
export function buildUpdateEntityFieldsData(
  caseId: string,
  input: UpdateEntityFieldsPatch
): UpdateEntityFieldsInput {
  const { entityId, kind, name, summary, notes } = input;
  return updateEntityFieldsInputSchema.parse({
    caseId,
    entityId,
    ...(kind === undefined ? {} : { kind }),
    ...(name === undefined ? {} : { name }),
    ...(summary === undefined ? {} : { summary }),
    ...(notes === undefined ? {} : { notes }),
  });
}
