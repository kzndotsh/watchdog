import { useQuery } from "@tanstack/react-query";

import { evidenceByIdQuery } from "@/domains/intake/queries";
import { loadEvidencePreviewDrawer } from "@/domains/triage/components/evidence-preview-drawer-load";
import { lazyOverlay } from "@/shared/lib/lazy-overlay";

const EvidencePreviewDrawerOverlay = lazyOverlay(
  loadEvidencePreviewDrawer,
  (module) => module.EvidencePreviewDrawer,
  { isOpen: (props) => props.evidence !== null }
);

type LazyEvidencePreviewDrawerProps = {
  /** The Evidence to preview, read by id when it is set (the Detail only holds titles). */
  evidenceId: string | null;
  caseId: string;
  onClose: () => void;
};

/**
 * Triage's Evidence preview behind a lazy boundary: the Evidence record is read by id when a
 * reviewer first opens an item, and the drawer's chunk loads with it. The drawer stays mounted
 * after that so a close keeps its exit animation.
 */
export function LazyEvidencePreviewDrawer({
  evidenceId,
  caseId,
  onClose,
}: LazyEvidencePreviewDrawerProps) {
  const query = useQuery(evidenceByIdQuery(caseId, evidenceId));
  const evidence = evidenceId === null ? null : (query.data ?? null);
  return (
    <EvidencePreviewDrawerOverlay
      evidence={evidence}
      caseId={caseId}
      onClose={onClose}
    />
  );
}
