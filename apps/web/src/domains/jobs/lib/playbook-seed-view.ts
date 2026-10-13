import { capEgressLabel } from "@watchdog/schemas/caps";
import { trimmedOrUndefined } from "@watchdog/schemas/shared";

import type { PlaybookListItem } from "../types";
import {
  missingCredentialNames,
  missingCredentialReason,
} from "./credential-gate";
import {
  playbookSeedOk,
  playbookSeedRequirements,
} from "./playbook-seed-requirements";

export type PlaybookSeedInput = {
  playbooks: readonly PlaybookListItem[];
  playbookId: string;
  host: string;
  url: string;
  evidenceId: string;
  ip: string;
  email: string;
  hash: string;
  handle: string;
  urlDumpCount: number;
  allowThirdPartyEgress: boolean;
  configuredCredentials: ReadonlySet<string>;
};

export type PlaybookSeedView = {
  selected: PlaybookListItem | undefined;
  needs: ReturnType<typeof playbookSeedRequirements>["needs"];
  isHostNeeded: boolean;
  isUrlNeeded: boolean;
  isEvidenceNeeded: boolean;
  isIpNeeded: boolean;
  isEmailNeeded: boolean;
  isHashNeeded: boolean;
  isHandleNeeded: boolean;
  shouldPickUrlDump: boolean;
  isEgressNeeded: boolean;
  missingCredentials: string[] | undefined;
  shouldShowEgressRow: boolean;
  egressLabel: string;
  canRun: boolean;
  blockedReason: string | undefined;
};

function blockedReason({
  isSelected,
  isEgressNeeded,
  missingCredentials,
  shouldPickUrlDump,
  hasUrlDumps,
  isSeedOk: seedOk,
}: {
  isSelected: boolean;
  isEgressNeeded: boolean;
  missingCredentials: string[] | undefined;
  shouldPickUrlDump: boolean;
  hasUrlDumps: boolean;
  isSeedOk: boolean;
}): string | undefined {
  if (!isSelected) return "No playbooks available";
  if (isEgressNeeded) {
    return "Enable Case third-party egress (Cases → edit) before running this playbook";
  }
  if (missingCredentials !== undefined) {
    return missingCredentialReason(missingCredentials, "playbook");
  }
  if (shouldPickUrlDump && !hasUrlDumps) {
    return "Dump a URL under Intake first — this playbook enriches that Evidence row";
  }
  if (seedOk) return undefined;
  return shouldPickUrlDump
    ? "Select a URL dump before Run Playbook"
    : "Fill required seed fields before Run Playbook";
}

/** Seed requirements + run gate for the Jobs playbook run form. */
export function buildPlaybookSeedView(
  input: PlaybookSeedInput
): PlaybookSeedView {
  const {
    playbooks,
    playbookId,
    host,
    url,
    evidenceId,
    ip,
    email,
    hash,
    handle,
    urlDumpCount,
    allowThirdPartyEgress,
    configuredCredentials,
  } = input;

  const scopedPlaybookId = trimmedOrUndefined(playbookId);
  const selected =
    scopedPlaybookId === undefined
      ? undefined
      : playbooks.find((p) => p.id === scopedPlaybookId);
  const isThirdPartyEgress =
    (selected?.requires.egress ?? "none") === "third_party";
  const needsEgress = isThirdPartyEgress && !allowThirdPartyEgress;
  const missingCredentials = missingCredentialNames(
    selected?.requires.credentials,
    configuredCredentials
  );
  const requirements = playbookSeedRequirements(selected);
  const seedOk = playbookSeedOk({
    requirements,
    host,
    ip,
    email,
    hash,
    handle,
    url,
    evidenceId,
  });

  return {
    selected,
    ...requirements,
    isEgressNeeded: needsEgress,
    missingCredentials,
    shouldShowEgressRow: isThirdPartyEgress,
    egressLabel: needsEgress
      ? `${capEgressLabel("third_party")} — enable on Case`
      : `${capEgressLabel("third_party")} (Case allows)`,
    canRun:
      Boolean(selected) &&
      seedOk &&
      !needsEgress &&
      missingCredentials === undefined &&
      !(requirements.shouldPickUrlDump && urlDumpCount === 0),
    blockedReason: blockedReason({
      isSelected: Boolean(selected),
      isEgressNeeded: needsEgress,
      missingCredentials,
      shouldPickUrlDump: requirements.shouldPickUrlDump,
      hasUrlDumps: urlDumpCount > 0,
      isSeedOk: seedOk,
    }),
  };
}
