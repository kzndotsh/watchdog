/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- create defaults + form hook shared with IdentifiersSection */

import { useForm } from "@tanstack/react-form";

import { isConfirmedBlocked } from "@/shared/lib/confirmed-evidence";
import { validateIdentifierWrite } from "@watchdog/schemas/graph";
import {
  parseOptionalTrimmedUuid,
  type ConfidenceTier,
  type IdentifierStatus,
  type IdentifierType,
} from "@watchdog/schemas/shared";

export const IDENTIFIER_CREATE_DEFAULTS = {
  entityId: "",
  type: "email" as IdentifierType,
  value: "",
  platform: "",
  status: "unknown" as IdentifierStatus,
  confidence: "unverified" as ConfidenceTier,
  evidenceIds: [] as string[],
};

export type IdentifierCreateValues = typeof IDENTIFIER_CREATE_DEFAULTS;

export function identifierCreateCanSubmit(
  values: IdentifierCreateValues,
  opts?: { shouldRequireEntity?: boolean }
): boolean {
  if (
    !validateIdentifierWrite({
      type: values.type,
      value: values.value,
      platform: values.platform,
    }).ok
  ) {
    return false;
  }
  if (
    opts?.shouldRequireEntity &&
    parseOptionalTrimmedUuid(values.entityId) === undefined
  ) {
    return false;
  }
  if (isConfirmedBlocked(values.confidence, values.evidenceIds)) return false;
  return true;
}

export function useIdentifierCreateForm(
  onSubmit: (args: {
    value: IdentifierCreateValues;
    reset: () => void;
  }) => Promise<void>
) {
  return useForm({
    defaultValues: IDENTIFIER_CREATE_DEFAULTS,
    onSubmit: async ({ value, formApi }) => {
      await onSubmit({
        value,
        reset: () => {
          formApi.reset();
        },
      });
    },
  });
}

export type IdentifierCreateForm = ReturnType<typeof useIdentifierCreateForm>;
