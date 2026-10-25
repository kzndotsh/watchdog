import { trimmedOrUndefined, type EgressClass } from "@watchdog/schemas/shared";

import type { PlaybookListItem } from "../types";
import { breachDisabledReason } from "./breach-disabled";
import { catalogGate, missingCredentialReason } from "./credential-gate";
import {
  egressBlockOf,
  egressBlockedReason,
  egressClassesPhrase,
  type EgressBlock,
} from "./egress-block";
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
  allowedEgress: readonly EgressClass[];
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
  egressBlock: EgressBlock | undefined;
  missingCredentials: string[] | undefined;
  shouldShowEgressRow: boolean;
  egressLabel: string;
  canRun: boolean;
  blockedReason: string | undefined;
};

function blockedReason({
  isSelected,
  isBreachOff,
  egressBlock,
  missingCredentials,
  shouldPickUrlDump,
  hasUrlDumps,
  isSeedOk: seedOk,
}: {
  isSelected: boolean;
  isBreachOff: boolean;
  egressBlock: EgressBlock | undefined;
  missingCredentials: string[] | undefined;
  shouldPickUrlDump: boolean;
  hasUrlDumps: boolean;
  isSeedOk: boolean;
}): string | undefined {
  if (!isSelected) return "No playbooks available";
  if (isBreachOff) return breachDisabledReason("playbook");
  if (egressBlock !== undefined) {
    return egressBlockedReason(egressBlock, "playbook");
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
    allowedEgress,
    configuredCredentials,
  } = input;

  const scopedPlaybookId = trimmedOrUndefined(playbookId);
  const selected =
    scopedPlaybookId === undefined
      ? undefined
      : playbooks.find((p) => p.id === scopedPlaybookId);
  const { isBreachOff, missingCredentials } = catalogGate(
    {
      disabledReason: selected?.disabledReason,
      credentials: selected?.requires.credentials,
    },
    configuredCredentials
  );
  const egressBlock = egressBlockOf(selected?.requires, allowedEgress);
  const needed = (selected?.requires.egress ?? []).filter((c) => c !== "local");
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
    egressBlock,
    missingCredentials,
    shouldShowEgressRow: needed.length > 0,
    egressLabel:
      egressBlock === undefined
        ? `${egressClassesPhrase(needed)} (Case allows)`
        : `${egressClassesPhrase(egressBlock.classes)} — enable on Case`,
    canRun:
      Boolean(selected) &&
      seedOk &&
      !isBreachOff &&
      egressBlock === undefined &&
      missingCredentials === undefined &&
      !(requirements.shouldPickUrlDump && urlDumpCount === 0),
    blockedReason: blockedReason({
      isSelected: Boolean(selected),
      isBreachOff,
      egressBlock,
      missingCredentials,
      shouldPickUrlDump: requirements.shouldPickUrlDump,
      hasUrlDumps: urlDumpCount > 0,
      isSeedOk: seedOk,
    }),
  };
}
