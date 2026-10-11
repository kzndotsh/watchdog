import { cn } from "@/lib/utils";
import { StackBodySkeletonLayout } from "@/shared/ui/skeletons/bodies/stack-body-skeleton-layout";

/**
 * Stack / tab data-slot skeleton (Case, Dossier, Dashboard regions).
 * No “Loading…” copy — skeleton layout only.
 */
/** Generic stack tab body — dossier tabs, settings, etc. Not case overview. */
export function StackBodySkeleton({
  sections = 3,
  className,
}: {
  sections?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <StackBodySkeletonLayout sections={sections} />
    </div>
  );
}
