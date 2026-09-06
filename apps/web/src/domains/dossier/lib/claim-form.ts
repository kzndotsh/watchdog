import { formOptions } from "@tanstack/react-form";

import type { ClaimRecord } from "@/domains/entities/claims/claims.functions";
import {
  CONFIRMED_REQUIRES_EVIDENCE,
  isConfirmedBlocked,
} from "@/shared/lib/confirmed-evidence";
import type { ClaimClass, ConfidenceTier } from "@watchdog/schemas";

export interface ClaimFormValues {
  text: string;
  claimClass: ClaimClass;
  confidence: ConfidenceTier;
  evidenceIds: string[];
}

export const claimFormOptions = formOptions({
  defaultValues: {
    text: "",
    claimClass: "observation" as ClaimClass,
    confidence: "unverified" as ConfidenceTier,
    evidenceIds: [] as string[],
  } satisfies ClaimFormValues,
});

export function claimDefaultsFromRow(row: ClaimRecord): ClaimFormValues {
  return {
    text: row.text,
    claimClass: row.class,
    confidence: row.confidence,
    evidenceIds: [...row.evidenceIds],
  };
}

export function claimEvidenceIdsValidator({
  value,
  fieldApi,
}: {
  value: string[];
  fieldApi: { form: { getFieldValue: (name: "confidence") => ConfidenceTier } };
}): string | undefined {
  const confidence = fieldApi.form.getFieldValue("confidence");
  if (isConfirmedBlocked(confidence, value)) {
    return CONFIRMED_REQUIRES_EVIDENCE;
  }
  // oxlint-disable-next-line unicorn/no-useless-undefined -- TanStack Form: undefined = valid
  return undefined;
}
