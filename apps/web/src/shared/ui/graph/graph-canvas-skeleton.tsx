import { GraphCanvasSkeletonLayout } from "@/shared/ui/graph/graph-canvas-skeleton-layout";

/** Graph canvas pending shell with optional dot grid. */
export function GraphCanvasSkeleton({ className }: { className?: string }) {
  return <GraphCanvasSkeletonLayout className={className} />;
}
