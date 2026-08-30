import { cn } from "@/lib/utils";
import {
  GRAPH_CANVAS_BG_CLASS,
  graphCanvasDotStyle,
} from "@/shared/ui/graph/graph-canvas-background";
import { EntityNodeSkeleton } from "@/shared/ui/graph/entity-node-skeleton";
import { confidenceStroke } from "@/shared/ui/graph/graph-styles";
import { LoadingRegion } from "@/shared/ui/loading-region";
import type { EntityKind } from "@watchdog/schemas";

/** Full-page case graph shell — matches `CaseGraphCanvas`. */
export const GRAPH_CANVAS_PAGE_SHELL_CLASS =
  "border-border h-[min(70vh,36rem)] min-h-[24rem] overflow-hidden rounded-md border";

/** Dossier overview ego-graph embed. */
export const GRAPH_CANVAS_EMBED_SHELL_CLASS =
  "border-border h-[min(38vh,19rem)] min-h-[17rem] overflow-hidden rounded-lg border";

/** Dossier Connections tab — flex-fills detail column. */
export const GRAPH_CANVAS_CONNECTIONS_SHELL_CLASS =
  "border-border min-h-64 flex-1 overflow-hidden rounded-lg border";

/** Triangle scatter — center points in % of canvas (x, y). */
const SKELETON_NODES = [
  { id: "person-center", x: 50, y: 24, kind: "person" },
  { id: "org-left", x: 30, y: 68, kind: "org" },
  { id: "infra-right", x: 70, y: 68, kind: "infra" },
] as const satisfies readonly {
  id: string;
  x: number;
  y: number;
  kind: EntityKind;
}[];

/** Fully connected triangle — every node linked to the other two. */
const SKELETON_EDGES: readonly [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 2],
];

const SKELETON_EDGE_STROKE = confidenceStroke("unverified");

function GraphSkeletonEdges() {
  return (
    <svg
      data-no-skeleton
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {SKELETON_EDGES.map(([from, to]) => {
        const source = SKELETON_NODES[from];
        const target = SKELETON_NODES[to];
        return (
          <line
            key={`${from}-${to}`}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke={SKELETON_EDGE_STROKE}
            strokeWidth={0.45}
            strokeOpacity={0.75}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

export function GraphCanvasPendingShell({
  className,
  /** Standalone loaders (route Suspense) — in-canvas overlay omits dots; parent owns the grid. */
  withDotGrid = false,
}: {
  className?: string;
  withDotGrid?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden",
        withDotGrid && GRAPH_CANVAS_BG_CLASS,
        className
      )}
      style={withDotGrid ? graphCanvasDotStyle() : undefined}
      data-slot="graph-canvas-skeleton"
      aria-live="polite"
    >
      <GraphSkeletonEdges />
      {SKELETON_NODES.map((node) => (
        <div
          key={node.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
        >
          <EntityNodeSkeleton kind={node.kind} />
        </div>
      ))}
    </div>
  );
}

/** Static graph skeleton scatter — no graph runtime. */
export function GraphCanvasSkeletonLayout({ className }: { className?: string }) {
  return <GraphCanvasPendingShell className={className} />;
}

/** Graph canvas pending shell with optional dot grid. */
export function GraphCanvasSkeleton({
  className,
}: {
  className?: string;
}) {
  return <GraphCanvasSkeletonLayout className={className} />;
}

interface GraphCanvasLoadingRegionProps {
  label?: string;
  shellClassName?: string;
  className?: string;
}

/** Runtime graph pending — hand cards on dot grid inside the real shell. */
export function GraphCanvasLoadingRegion({
  label = "Loading graph",
  shellClassName = GRAPH_CANVAS_PAGE_SHELL_CLASS,
  className,
}: GraphCanvasLoadingRegionProps) {
  return (
    <div className={cn(shellClassName, className)}>
      <LoadingRegion label={label} className="h-full w-full">
        <GraphCanvasPendingShell
          withDotGrid
          className="h-full w-full"
        />
      </LoadingRegion>
    </div>
  );
}
