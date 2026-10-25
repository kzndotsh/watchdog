import {
  parseOptionalTrimmedUuid,
  trimmedOrUndefined,
  type EgressClass,
} from "@watchdog/schemas/shared";

import type { CapListItem } from "../types";
import { breachDisabledReason } from "./breach-disabled";
import { capPrimaryField, type CapPrimaryField } from "./cap-run-input";
import { catalogGate, missingCredentialReason } from "./credential-gate";
import {
  egressBlockOf,
  egressBlockedReason,
  type EgressBlock,
} from "./egress-block";

export type CapRunInput = {
  caps: readonly CapListItem[];
  capabilityId: string;
  runInput: string;
  entityId: string;
  allowedEgress: readonly EgressClass[];
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
  egressBlock: EgressBlock | undefined;
  missingCredentials: string[] | undefined;
  canRun: boolean;
  blockedReason: string | undefined;
  shouldShowEvidenceOnlyHint: boolean;
};

function blockedReason({
  isSelected,
  isBreachOff,
  egressBlock,
  missingCredentials,
  hasInput,
  hasCaps,
}: {
  isSelected: boolean;
  isBreachOff: boolean;
  egressBlock: EgressBlock | undefined;
  missingCredentials: string[] | undefined;
  hasInput: boolean;
  hasCaps: boolean;
}): string | undefined {
  if (!isSelected) {
    return hasCaps ? "Select a Cap" : "No Caps match the current filters";
  }
  if (isBreachOff) return breachDisabledReason("Cap");
  if (egressBlock !== undefined) return egressBlockedReason(egressBlock, "Cap");
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
    allowedEgress,
    configuredCredentials,
  } = input;

  const scopedCapabilityId = trimmedOrUndefined(capabilityId);
  const selected =
    scopedCapabilityId === undefined
      ? undefined
      : caps.find((c) => c.id === scopedCapabilityId);
  const { isBreachOff, missingCredentials } = catalogGate(
    {
      disabledReason: selected?.disabledReason,
      credentials: selected?.credentials,
    },
    configuredCredentials
  );
  const egressBlock = egressBlockOf(selected, allowedEgress);

  return {
    selected,
    primaryField: capPrimaryField(selected?.inputForm),
    egressBlock,
    missingCredentials,
    canRun:
      Boolean(selected) &&
      Boolean(runInput.trim()) &&
      !isBreachOff &&
      egressBlock === undefined &&
      missingCredentials === undefined,
    blockedReason: blockedReason({
      isSelected: Boolean(selected),
      isBreachOff,
      egressBlock,
      missingCredentials,
      hasInput: Boolean(runInput.trim()),
      hasCaps: caps.length > 0,
    }),
    shouldShowEvidenceOnlyHint:
      parseOptionalTrimmedUuid(entityId) === undefined,
  };
}
