import type { UpdateEntityFieldsInput } from "@/domains/entities/types";
import { updateEntityInputSchema as updateEntityFieldsInputSchema } from "@watchdog/schemas/graph";
import type { EntityKind } from "@watchdog/schemas/shared";

export type UpdateEntityFieldsPatch = {
  entityId: string;
  /** The Entity's `version` as loaded; the write fails as stale if it moved on. */
  expectedVersion: number;
  kind?: EntityKind;
  name?: string;
  summary?: string | null;
  notes?: string | null;
};

/** Normalize entity field PATCH payloads at ingress. */
export function buildUpdateEntityFieldsData(
  caseId: string,
  input: UpdateEntityFieldsPatch
): UpdateEntityFieldsInput {
  const { entityId, expectedVersion, kind, name, summary, notes } = input;
  return updateEntityFieldsInputSchema.parse({
    caseId,
    entityId,
    expectedVersion,
    ...(kind === undefined ? {} : { kind }),
    ...(name === undefined ? {} : { name }),
    ...(summary === undefined ? {} : { summary }),
    ...(notes === undefined ? {} : { notes }),
  });
}
