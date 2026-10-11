import {
  updateCaseInputSchema,
  type UpdateCaseInput,
} from "@watchdog/schemas/cases";

export type UpdateCasePatch = {
  name?: string;
  description?: string | null;
  allowThirdPartyEgress?: boolean;
};

/** Normalize case PATCH payloads at ingress. */
export function buildUpdateCaseData(
  caseId: string,
  patch: UpdateCasePatch
): UpdateCaseInput {
  return updateCaseInputSchema.parse({
    caseId,
    ...patch,
  });
}
