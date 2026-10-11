import { DossierSectionBlockSkeleton } from "@/shared/ui/skeletons/dossier/parts/dossier-section-block-skeleton";
import { Skeleton } from "@watchdog/ui/components/skeleton";

/** Dossier Notes tab — full-height rich text editor. */
export function DossierNotesSkeletonLayout() {
  return (
    <DossierSectionBlockSkeleton titleWidth="w-12" showAction={false}>
      <Skeleton className="border-border min-h-[min(70vh,36rem)] w-full flex-1 rounded-md border" />
    </DossierSectionBlockSkeleton>
  );
}
