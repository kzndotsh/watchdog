import type { PlaybookSeedKind } from "@watchdog/schemas/shared";
import { parseOptionalTrimmedUuid } from "@watchdog/schemas/shared";

import type { PlaybookListItem } from "../types";

export type PlaybookSeedRequirements = {
  needs: readonly PlaybookSeedKind[];
  isHostNeeded: boolean;
  isUrlNeeded: boolean;
  isEvidenceNeeded: boolean;
  isIpNeeded: boolean;
  isEmailNeeded: boolean;
  isHashNeeded: boolean;
  isHandleNeeded: boolean;
  shouldPickUrlDump: boolean;
};

function seedFieldOk(isRequired: boolean, value: string): boolean {
  return !isRequired || Boolean(value.trim());
}

function seedUuidOk(isRequired: boolean, value: string): boolean {
  return !isRequired || parseOptionalTrimmedUuid(value) !== undefined;
}

export function playbookSeedRequirements(
  selected: PlaybookListItem | undefined
): PlaybookSeedRequirements {
  const needs = selected?.seedKinds ?? [];
  const needsKind = (kind: PlaybookSeedKind) => needs.includes(kind);
  const needsHost = needsKind("host");
  const needsUrl = needsKind("url");
  const needsEvidence = needsKind("evidence");
  const pickUrlDump = needsUrl && needsEvidence;

  return {
    needs,
    isHostNeeded: needsHost,
    isUrlNeeded: needsUrl,
    isEvidenceNeeded: needsEvidence,
    isIpNeeded: needsKind("ip"),
    isEmailNeeded: needsKind("email"),
    isHashNeeded: needsKind("hash"),
    isHandleNeeded: needsKind("handle"),
    shouldPickUrlDump: pickUrlDump,
  };
}

export function playbookSeedOk(input: {
  requirements: PlaybookSeedRequirements;
  host: string;
  ip: string;
  email: string;
  hash: string;
  handle: string;
  url: string;
  evidenceId: string;
}): boolean {
  const { requirements } = input;
  const baseOk =
    seedFieldOk(requirements.isHostNeeded, input.host) &&
    seedFieldOk(requirements.isIpNeeded, input.ip) &&
    seedFieldOk(requirements.isEmailNeeded, input.email) &&
    seedFieldOk(requirements.isHashNeeded, input.hash) &&
    seedFieldOk(requirements.isHandleNeeded, input.handle);

  if (requirements.shouldPickUrlDump) {
    return (
      baseOk &&
      parseOptionalTrimmedUuid(input.evidenceId) !== undefined &&
      Boolean(input.url.trim())
    );
  }

  return (
    baseOk &&
    seedFieldOk(requirements.isUrlNeeded, input.url) &&
    seedUuidOk(requirements.isEvidenceNeeded, input.evidenceId)
  );
}
