/** Custody gates for dossier-child Graph writes from the CLI. */

import type { ConfidenceTier } from "@watchdog/schemas";

import { fail } from "./io";

export const userOverrideArg = {
  "user-override": {
    type: "boolean" as const,
    description:
      "Required for direct Graph child writes (prefer proposals / graph write)",
    default: false,
  },
} as const;

export function requireUserOverride(enabled: boolean): void {
  if (!enabled) {
    fail(
      "CUSTODY",
      "Child Graph writes require --user-override. Prefer proposals create or graph write.",
      {
        help: [
          "wd proposals create -c <caseId> --patch-file <path>",
          "wd graph write -c <caseId> --patch-file <path>",
          'wd claims create -c <caseId> --entity <slug> --text "…" --confidence unverified --user-override',
        ],
      }
    );
  }
}

/** Core only checks evidence count for confirmed — CLI refuses it outright. */
export function refuseConfirmed(confidence: ConfidenceTier | undefined): void {
  if (confidence === "confirmed") {
    fail(
      "CUSTODY",
      "CLI refuses confidence=confirmed on child Graph writes. Accept via Inbox or edit in Dossier.",
      {
        help: [
          "wd proposals accept -c <caseId> <proposalId> --confidence confirmed",
          'wd claims create -c <caseId> --entity <slug> --text "…" --confidence unverified --user-override',
        ],
      }
    );
  }
}
