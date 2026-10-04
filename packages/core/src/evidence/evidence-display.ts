import { evidenceDisplayLabel } from "@watchdog/schemas/evidence";
import type { EvidenceKind } from "@watchdog/schemas/shared";

export function evidenceKindLabel(kind: EvidenceKind): string {
  return evidenceDisplayLabel({ label: null, kind });
}
