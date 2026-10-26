import { lazy, Suspense, useState, type ComponentProps } from "react";

import { loadEvidencePreviewDrawer } from "@/domains/triage/components/evidence-preview-drawer-load";

const LoadedEvidencePreviewDrawer = lazy(async () => {
  const { EvidencePreviewDrawer } = await loadEvidencePreviewDrawer();
  return { default: EvidencePreviewDrawer };
});

/**
 * Triage's Evidence preview behind a lazy boundary: its chunk loads when a reviewer first opens
 * an Evidence item, and the drawer stays mounted after that so a close keeps its exit
 * animation. Same props as `EvidencePreviewDrawer`.
 */
export function LazyEvidencePreviewDrawer(
  props: ComponentProps<typeof LoadedEvidencePreviewDrawer>
) {
  const [isMounted, setIsMounted] = useState(false);
  if (props.evidence !== null && !isMounted) setIsMounted(true);
  if (!isMounted) return null;
  return (
    <Suspense fallback={null}>
      <LoadedEvidencePreviewDrawer {...props} />
    </Suspense>
  );
}
