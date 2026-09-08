import type { EvidenceKind } from "@watchdog/schemas";
import { evidenceDisplayLabel } from "@watchdog/schemas";

export { evidenceDisplayLabel } from "@watchdog/schemas";

export function evidenceKindLabel(kind: EvidenceKind): string {
  return evidenceDisplayLabel({ label: null, kind });
}
