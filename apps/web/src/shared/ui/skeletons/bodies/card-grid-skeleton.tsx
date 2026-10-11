import { CardGridSkeletonLayout } from "@/shared/ui/skeletons/bodies/card-grid-skeleton-layout";
import { CARD_GRID_SKELETON_SLOT_COUNT } from "@/shared/ui/skeletons/constants";

/** Case list grid slot — matches CaseSlotGhost dimensions. */
export function CardGridSkeleton({
  slots = CARD_GRID_SKELETON_SLOT_COUNT,
  className,
}: {
  slots?: number;
  className?: string;
}) {
  return <CardGridSkeletonLayout slots={slots} className={className} />;
}
