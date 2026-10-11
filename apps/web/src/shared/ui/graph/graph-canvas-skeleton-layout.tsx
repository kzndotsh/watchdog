import { GraphCanvasPendingShell } from "@/shared/ui/graph/graph-canvas-pending-shell";

/** Static graph skeleton scatter — no graph runtime. */
export function GraphCanvasSkeletonLayout({
  className,
}: {
  className?: string;
}) {
  return <GraphCanvasPendingShell className={className} />;
}
