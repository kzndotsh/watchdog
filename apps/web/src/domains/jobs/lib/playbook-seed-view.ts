import { capEgressLabel } from "@/shared/ui/vocab/cap-egress.lib";
import { trimmedOrUndefined } from "@watchdog/schemas";

import type { PlaybookListItem } from "../types";
import {
  missingCredentialNames,
  missingCredentialReason,
} from "./credential-gate";
import {
  playbookSeedOk,
  playbookSeedRequirements,
} from "./playbook-seed-requirements";

export interface PlaybookSeedInput {
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
}

export interface PlaybookSeedView {
  selected: PlaybookListItem | undefined;
  needs: ReturnType<typeof playbookSeedRequirements>["needs"];
  needsHost: boolean;
  needsUrl: boolean;
  needsEvidence: boolean;
  needsIp: boolean;
  needsEmail: boolean;
  needsHash: boolean;
  needsHandle: boolean;
  pickUrlDump: boolean;
  needsEgress: boolean;
  missingCredentials: string[] | undefined;
  showEgressRow: boolean;
  egressLabel: string;
  canRun: boolean;
  blockedReason: string | undefined;
}

function blockedReason({
  selected,
  needsEgress,
  missingCredentials,
  pickUrlDump,
  hasUrlDumps,
  seedOk,
}: {
  selected: boolean;
  needsEgress: boolean;
  missingCredentials: string[] | undefined;
  pickUrlDump: boolean;
  hasUrlDumps: boolean;
  seedOk: boolean;
}): string | undefined {
  if (!selected) return "No playbooks available";
  if (needsEgress) {
    return "Enable Case third-party egress (Cases → edit) before running this playbook";
  }
  if (missingCredentials !== undefined) {
    return missingCredentialReason(missingCredentials, "playbook");
  }
  if (pickUrlDump && !hasUrlDumps) {
    return "Dump a URL under Intake first — this playbook enriches that Evidence row";
  }
  if (seedOk) return undefined;
  return pickUrlDump
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
  const thirdPartyEgress =
    (selected?.requires.egress ?? "none") === "third_party";
  const needsEgress = thirdPartyEgress && !allowThirdPartyEgress;
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
    needsEgress,
    missingCredentials,
    showEgressRow: thirdPartyEgress,
    egressLabel: needsEgress
      ? `${capEgressLabel("third_party")} — enable on Case`
      : `${capEgressLabel("third_party")} (Case allows)`,
    canRun:
      Boolean(selected) &&
      seedOk &&
      !needsEgress &&
      missingCredentials === undefined &&
      !(requirements.pickUrlDump && urlDumpCount === 0),
    blockedReason: blockedReason({
      selected: Boolean(selected),
      needsEgress,
      missingCredentials,
      pickUrlDump: requirements.pickUrlDump,
      hasUrlDumps: urlDumpCount > 0,
      seedOk,
    }),
  };
}
