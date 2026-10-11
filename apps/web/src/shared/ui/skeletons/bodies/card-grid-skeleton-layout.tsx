import { cn } from "@/lib/utils";
import {
  CASE_CARD_MIN_HEIGHT_CLASS,
  CASE_CARD_SHELL_CLASS,
} from "@/shared/ui/case-card-shell";
import { CARD_GRID_SKELETON_SLOT_COUNT } from "@/shared/ui/skeletons/constants";

export function CardGridSkeletonLayout({
  slots = CARD_GRID_SKELETON_SLOT_COUNT,
  className,
}: {
  slots?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid auto-rows-[minmax(10rem,auto)] grid-cols-1 gap-3 p-px sm:grid-cols-2 xl:grid-cols-3",
        className
      )}
    >
      {Array.from({ length: slots }).map((_, i) => (
        <div
          key={i}
          className={cn(
            CASE_CARD_SHELL_CLASS,
            "animate-pulse",
            CASE_CARD_MIN_HEIGHT_CLASS
          )}
        />
      ))}
    </div>
  );
}
