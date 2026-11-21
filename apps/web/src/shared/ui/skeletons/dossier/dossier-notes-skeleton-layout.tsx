import { Skeleton } from "#ui/components/skeleton";
import { DossierSectionBlockSkeleton } from "@/shared/ui/skeletons/dossier/parts/dossier-section-block-skeleton";

/** Dossier Notes tab — full-height rich text editor. */
export function DossierNotesSkeletonLayout() {
  return (
    <DossierSectionBlockSkeleton titleWidth="w-12" shouldShowAction={false}>
      <Skeleton className="border-border min-h-[min(70vh,36rem)] w-full flex-1 rounded-md border" />
    </DossierSectionBlockSkeleton>
  );
}
