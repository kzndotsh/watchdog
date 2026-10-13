import {
  parseOptionalTrimmedUuid,
  trimmedOrUndefined,
} from "@watchdog/schemas/shared";

import type { CapListItem } from "../types";
import { capPrimaryField, type CapPrimaryField } from "./cap-run-input";
import {
  missingCredentialNames,
  missingCredentialReason,
} from "./credential-gate";

export type CapRunInput = {
  caps: readonly CapListItem[];
  capabilityId: string;
  runInput: string;
  entityId: string;
  allowThirdPartyEgress: boolean;
  configuredCredentials: ReadonlySet<string>;
};

export type CapInfoRow = {
  label: string;
  value: string;
  isMono?: boolean;
};

export { capInfoRows } from "./cap-info-rows";

export type CapRunView = {
  selected: CapListItem | undefined;
  primaryField: CapPrimaryField;
  isEgressNeeded: boolean;
  missingCredentials: string[] | undefined;
  canRun: boolean;
  blockedReason: string | undefined;
  shouldShowEvidenceOnlyHint: boolean;
};

function blockedReason({
  isSelected,
  isEgressNeeded,
  missingCredentials,
  hasInput,
  hasCaps,
}: {
  isSelected: boolean;
  isEgressNeeded: boolean;
  missingCredentials: string[] | undefined;
  hasInput: boolean;
  hasCaps: boolean;
}): string | undefined {
  if (!isSelected) {
    return hasCaps ? "Select a Cap" : "No Caps match the current filters";
  }
  if (isEgressNeeded) {
    return "Enable Case third-party egress (Cases → edit) before running this Cap";
  }
  if (missingCredentials !== undefined) {
    return missingCredentialReason(missingCredentials, "Cap");
  }
  return hasInput ? undefined : "Enter Cap input before Run";
}

/** Selected Cap metadata + run gate for the Jobs Cap run form. */
export function buildCapRunView(input: CapRunInput): CapRunView {
  const {
    caps,
    capabilityId,
    runInput,
    entityId,
    allowThirdPartyEgress,
    configuredCredentials,
  } = input;

  const scopedCapabilityId = trimmedOrUndefined(capabilityId);
  const selected =
    scopedCapabilityId === undefined
      ? undefined
      : caps.find((c) => c.id === scopedCapabilityId);
  const needsEgress =
    (selected?.egress ?? "none") === "third_party" && !allowThirdPartyEgress;
  const missingCredentials = missingCredentialNames(
    selected?.credentials,
    configuredCredentials
  );

  return {
    selected,
    primaryField: capPrimaryField(selected?.inputForm),
    isEgressNeeded: needsEgress,
    missingCredentials,
    canRun:
      Boolean(selected) &&
      Boolean(runInput.trim()) &&
      !needsEgress &&
      missingCredentials === undefined,
    blockedReason: blockedReason({
      isSelected: Boolean(selected),
      isEgressNeeded: needsEgress,
      missingCredentials,
      hasInput: Boolean(runInput.trim()),
      hasCaps: caps.length > 0,
    }),
    shouldShowEvidenceOnlyHint:
      parseOptionalTrimmedUuid(entityId) === undefined,
  };
}
