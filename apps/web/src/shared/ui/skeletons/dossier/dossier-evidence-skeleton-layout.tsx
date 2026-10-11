import { DossierSectionBlockSkeleton } from "@/shared/ui/skeletons/dossier/parts/dossier-section-block-skeleton";
import { Skeleton } from "@watchdog/ui/components/skeleton";

/** Dossier Evidence tab — dump actions + evidence rows. */
export function DossierEvidenceSkeletonLayout() {
  return (
    <DossierSectionBlockSkeleton titleWidth="w-20">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="border-border flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-4 min-w-0 flex-1" />
              <Skeleton className="h-3 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </DossierSectionBlockSkeleton>
  );
}
