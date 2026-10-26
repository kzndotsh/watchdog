import { TaskCardSkeleton } from "@/shared/ui/skeletons/bodies/task-card-skeleton";

/** A finished column's cards while its first page loads (the list's own pending state). */
export function TaskColumnCardsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: cards }).map((_, cardIndex) => (
        <TaskCardSkeleton
          key={cardIndex}
          shouldShowFooter={cardIndex % 2 === 0}
        />
      ))}
    </div>
  );
}
