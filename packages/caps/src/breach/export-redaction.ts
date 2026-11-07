import type { CredentialFingerprint } from "@watchdog/tools/breach";

import { CAPABILITIES } from "../registry";
import { isBreachCapId } from "../sdk";

/**
 * A breach Cap's stored artifact as an Export may carry it: credential fields cut to their
 * safe-mode attributes (present, kind, length, fingerprint) through the redactor the Cap itself
 * declares (`exportRedaction` on `defineCollectCap`, required by type for a `breach.*` id).
 * `null` when the Cap is not a breach Cap, or the artifact does not match the Cap's snapshot
 * schema: the Export then withholds the file, never writes it as is.
 */
export function redactBreachArtifact(
  capabilityId: string,
  value: unknown,
  fingerprint: CredentialFingerprint
): string | null {
  if (!isBreachCapId(capabilityId)) return null;
  const redactor = CAPABILITIES.find(
    (cap) => cap.id === capabilityId
  )?.exportRedactor;
  return redactor === undefined ? null : redactor(value, fingerprint);
}
