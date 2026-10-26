import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";

import { evidenceByIdQuery } from "@/domains/intake/queries";
import { loadEvidencePreviewDrawer } from "@/domains/triage/components/evidence-preview-drawer-load";

const LoadedEvidencePreviewDrawer = lazy(async () => {
  const { EvidencePreviewDrawer } = await loadEvidencePreviewDrawer();
  return { default: EvidencePreviewDrawer };
});

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
  const [isMounted, setIsMounted] = useState(false);
  if (evidence !== null && !isMounted) setIsMounted(true);
  if (!isMounted) return null;
  return (
    <Suspense fallback={null}>
      <LoadedEvidencePreviewDrawer
        evidence={evidence}
        caseId={caseId}
        onClose={onClose}
      />
    </Suspense>
  );
}
