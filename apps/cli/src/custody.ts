/** Custody gates for dossier-child Graph writes from the CLI. */

import { childWriteViolation } from "@watchdog/policy";
import {
  trimmedConfidenceTierSchema,
  type ConfidenceTier,
} from "@watchdog/schemas";

import { fail } from "./io";
import { parseOptionalCliEnum } from "./parse-cli";

export const userOverrideArg = {
  "user-override": {
    type: "boolean" as const,
    description:
      "Required for direct Graph child writes (prefer proposals / graph write)",
    default: false,
  },
} as const;

export function requireUserOverride(enabled: boolean): void {
  const violation = childWriteViolation({
    userOverride: enabled,
    confidence: undefined,
  });
  if (violation) {
    fail("CUSTODY", violation.message, {
      help: [
        "wd proposals create -c <caseId> --patch-file <path>",
        "wd graph write -c <caseId> --patch-file <path>",
        'wd claims create -c <caseId> --entity <slug> --text "…" --confidence unverified --user-override',
      ],
    });
  }
}

export function parseOptionalConfidence(
  value: string | undefined
): ConfidenceTier | undefined {
  return parseOptionalCliEnum(
    trimmedConfidenceTierSchema,
    value,
    "--confidence (unverified|possible|confirmed)",
    [
      'wd claims create -c <caseId> --entity <slug> --text "…" --confidence unverified --user-override',
    ]
  );
}

/** Core only checks evidence count for confirmed — CLI refuses it outright. */
export function refuseConfirmed(confidence: ConfidenceTier | undefined): void {
  const violation = childWriteViolation({ userOverride: true, confidence });
  if (violation) {
    fail("CUSTODY", violation.message, {
      help: [
        "wd proposals accept -c <caseId> <proposalId> --confidence confirmed",
        'wd claims create -c <caseId> --entity <slug> --text "…" --confidence unverified --user-override',
      ],
    });
  }
}

/** Parse optional --confidence and refuse confirmed tier for child writes. */
export function guardChildWriteConfidence(
  value: string | undefined
): ConfidenceTier | undefined {
  const confidence = parseOptionalConfidence(value);
  refuseConfirmed(confidence);
  return confidence;
}
