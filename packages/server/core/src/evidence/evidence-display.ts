import { evidenceDisplayLabel } from "@watchdog/domain/schemas/evidence";
import type { EvidenceKind } from "@watchdog/domain/schemas/shared";

export function evidenceKindLabel(kind: EvidenceKind): string {
  return evidenceDisplayLabel({ label: null, kind });
}
