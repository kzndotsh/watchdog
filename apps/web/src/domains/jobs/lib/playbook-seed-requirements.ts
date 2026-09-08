import type { PlaybookSeedKind } from "@watchdog/schemas";
import { parseOptionalTrimmedUuid } from "@watchdog/schemas";

import type { PlaybookListItem } from "../types";

export interface PlaybookSeedRequirements {
  needs: readonly PlaybookSeedKind[];
  needsHost: boolean;
  needsUrl: boolean;
  needsEvidence: boolean;
  needsIp: boolean;
  needsEmail: boolean;
  needsHash: boolean;
  needsHandle: boolean;
  pickUrlDump: boolean;
}

function seedFieldOk(required: boolean, value: string): boolean {
  return !required || Boolean(value.trim());
}

function seedUuidOk(required: boolean, value: string): boolean {
  return !required || parseOptionalTrimmedUuid(value) !== undefined;
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
    needsHost,
    needsUrl,
    needsEvidence,
    needsIp: needsKind("ip"),
    needsEmail: needsKind("email"),
    needsHash: needsKind("hash"),
    needsHandle: needsKind("handle"),
    pickUrlDump,
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
    seedFieldOk(requirements.needsHost, input.host) &&
    seedFieldOk(requirements.needsIp, input.ip) &&
    seedFieldOk(requirements.needsEmail, input.email) &&
    seedFieldOk(requirements.needsHash, input.hash) &&
    seedFieldOk(requirements.needsHandle, input.handle);

  if (requirements.pickUrlDump) {
    return (
      baseOk &&
      parseOptionalTrimmedUuid(input.evidenceId) !== undefined &&
      Boolean(input.url.trim())
    );
  }

  return (
    baseOk &&
    seedFieldOk(requirements.needsUrl, input.url) &&
    seedUuidOk(requirements.needsEvidence, input.evidenceId)
  );
}
