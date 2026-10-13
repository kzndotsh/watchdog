import { cn } from "@/lib/utils";
import { GraphCanvasPendingShell } from "@/shared/ui/graph/graph-canvas-pending-shell";
import { GRAPH_CANVAS_PAGE_SHELL_CLASS } from "@/shared/ui/graph/graph-canvas-shell-classes";
import { LoadingRegion } from "@/shared/ui/loading-region";

type GraphCanvasLoadingRegionProps = {
  label?: string;
  shellClassName?: string;
  className?: string;
};

/** Runtime graph pending — hand cards on dot grid inside the real shell. */
export function GraphCanvasLoadingRegion({
  label = "Loading graph",
  shellClassName = GRAPH_CANVAS_PAGE_SHELL_CLASS,
  className,
}: GraphCanvasLoadingRegionProps) {
  return (
    <div className={cn(shellClassName, className)}>
      <LoadingRegion label={label} className="h-full w-full">
        <GraphCanvasPendingShell hasDotGrid className="h-full w-full" />
      </LoadingRegion>
    </div>
  );
}
