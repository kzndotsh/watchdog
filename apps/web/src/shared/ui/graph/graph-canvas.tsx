"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import type { AppAction } from "@/shared/lib/app-action";
import { filterActionsForSurface } from "@/shared/lib/app-action";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/shared/hooks/use-hydrated";
import { ActionsContextMenu } from "@/shared/ui/actions-context-menu";
import {
  GRAPH_CANVAS_BG_CLASS,
  graphCanvasDotStyle,
} from "@/shared/ui/graph/graph-canvas-background";
import { EntityNode } from "@/shared/ui/graph/entity-node";
import { GraphEdgePath } from "@/shared/ui/graph/graph-edge";
import { GraphCanvasPendingShell } from "@/shared/ui/graph/graph-canvas-skeleton";
import {
  computeGraphBounds,
  computeGraphFitTransform,
  GRAPH_CANVAS_FIT_PADDING,
  GRAPH_CANVAS_MAX_ZOOM,
  GRAPH_CANVAS_MIN_ZOOM,
  type GraphTransform,
} from "@/shared/ui/graph/graph-layout";
import type { GraphEdge, GraphNode } from "@/shared/ui/graph/types";

function GraphNodeHitTarget({
  node,
  nodesDraggable,
  actions,
  suppressNodeClickRef,
  onNodePointerDown,
  onNodePointerMove,
  onNodePointerUp,
  onNodeClick,
}: {
  node: GraphNode;
  nodesDraggable: boolean;
  actions: readonly AppAction[];
  suppressNodeClickRef: RefObject<string | null>;
  onNodePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    node: GraphNode
  ) => void;
  onNodePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onNodePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onNodeClick?: (event: ReactMouseEvent, node: GraphNode) => void;
}) {
  const dropdownActions = filterActionsForSurface(actions, "dropdown");
  const shellProps = {
    "data-graph-node": "",
    role: "button" as const,
    tabIndex: 0,
    "aria-label": node.data.label,
    className: cn(
      "absolute",
      nodesDraggable && "cursor-grab active:cursor-grabbing select-none"
    ),
    style: {
      left: node.position.x,
      top: node.position.y,
    },
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      onNodePointerDown(event, node);
    },
    onPointerMove: onNodePointerMove,
    onPointerUp: onNodePointerUp,
    onPointerCancel: onNodePointerUp,
    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.currentTarget.click();
    },
    onClick: (event: ReactMouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (suppressNodeClickRef.current === node.id) {
        suppressNodeClickRef.current = null;
        return;
      }
      onNodeClick?.(event, node);
    },
  };

  if (actions.length > 0) {
    return (
      <ActionsContextMenu
        actions={actions}
        trigger={<div {...shellProps} />}
      >
        <EntityNode
          data={node.data}
          selected={node.selected}
          actions={dropdownActions}
        />
      </ActionsContextMenu>
    );
  }

  return (
    <div {...shellProps}>
      <EntityNode data={node.data} selected={node.selected} />
    </div>
  );
}

function clampZoom(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeWheelDelta(event: WheelEvent): number {
  let delta = event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    delta *= 16;
  } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    delta *= 800;
  }
  return delta;
}

function zoomAtPoint(
  transform: GraphTransform,
  point: { x: number; y: number },
  deltaY: number,
  minZoom: number,
  maxZoom: number
): GraphTransform {
  const factor = deltaY > 0 ? 0.9 : 1.1;
  const nextK = clampZoom(transform.k * factor, minZoom, maxZoom);
  const ratio = nextK / transform.k;
  return {
    k: nextK,
    x: point.x - (point.x - transform.x) * ratio,
    y: point.y - (point.y - transform.y) * ratio,
  };
}

export function GraphCanvas({
  nodes,
  edges,
  className,
  minZoom = GRAPH_CANVAS_MIN_ZOOM,
  maxZoom = GRAPH_CANVAS_MAX_ZOOM,
  fitPadding = GRAPH_CANVAS_FIT_PADDING,
  nodesDraggable = true,
  onNodeClick,
  getNodeActions,
  onEdgeClick,
  onPaneClick,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  className?: string;
  minZoom?: number;
  maxZoom?: number;
  fitPadding?: number;
  nodesDraggable?: boolean;
  onNodeClick?: (event: ReactMouseEvent, node: GraphNode) => void;
  /** Optional ContextMenu + ⋯ actions; Case overview omits. */
  getNodeActions?: (node: GraphNode) => readonly AppAction[];
  onEdgeClick?: (event: ReactMouseEvent, edge: GraphEdge) => void;
  onPaneClick?: () => void;
}) {
  const hydrated = useHydrated();
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<GraphTransform>({ x: 0, y: 0, k: 1 });
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const nodeDragRef = useRef<{
    pointerId: number;
    nodeId: string;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const suppressNodeClickRef = useRef<string | null>(null);
  const [positionOverrides, setPositionOverrides] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [transform, setTransform] = useState<GraphTransform>({
    x: 0,
    y: 0,
    k: 1,
  });
  const [viewReady, setViewReady] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const applyTransform = useCallback(
    (next: GraphTransform | ((current: GraphTransform) => GraphTransform)) => {
      setTransform((current) => {
        if (typeof next === "function") {
          return next(current);
        }
        return next;
      });
    },
    []
  );

  const nodeLayoutKey = useMemo(
    () =>
      nodes
        .map((node) => `${node.id}:${node.position.x},${node.position.y}`)
        .join("|"),
    [nodes]
  );

  useLayoutEffect(() => {
    setPositionOverrides({});
  }, [nodeLayoutKey]);

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        position: positionOverrides[node.id] ?? node.position,
      })),
    [nodes, positionOverrides]
  );

  const nodeMap = useMemo(
    () => new Map(displayNodes.map((node) => [node.id, node])),
    [displayNodes]
  );

  const fitToContainer = useCallback(() => {
    const element = containerRef.current;
    if (!element) return null;
    const { width, height } = element.getBoundingClientRect();
    if (width <= 0 || height <= 0) return null;

    if (nodes.length === 0) {
      const next = { x: 0, y: 0, k: 1 };
      applyTransform(next);
      return next;
    }

    const bounds = computeGraphBounds(nodes);
    if (!bounds) return null;
    const next = computeGraphFitTransform({
      bounds,
      width,
      height,
      padding: fitPadding,
      minZoom,
    });
    applyTransform(next);
    return next;
  }, [applyTransform, fitPadding, minZoom, nodes]);

  useLayoutEffect(() => {
    if (!hydrated) {
      return;
    }
    setViewReady(false);
    fitToContainer();
    setViewReady(true);
  }, [fitToContainer, hydrated, edges.length, nodeLayoutKey]);

  useLayoutEffect(() => {
    if (!hydrated) {
      return;
    }
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      fitToContainer();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [fitToContainer, hydrated]);

  const applyTransformEvent = useEffectEvent(applyTransform);
  const fitToContainerEvent = useEffectEvent(fitToContainer);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !hydrated) {
      return;
    }

    const zoomFromWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const deltaY = normalizeWheelDelta(event);
      applyTransformEvent((current) =>
        zoomAtPoint(
          current,
          {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          },
          deltaY,
          minZoom,
          maxZoom
        )
      );
    };

    const zoomFromKeyboard = (event: KeyboardEvent) => {
      const overCanvas =
        element.matches(":hover") || element.contains(document.activeElement);
      if (!overCanvas) return;
      if (!(event.ctrlKey || event.metaKey)) return;

      const rect = element.getBoundingClientRect();
      const center = { x: rect.width / 2, y: rect.height / 2 };

      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        applyTransformEvent((current) =>
          zoomAtPoint(current, center, -1, minZoom, maxZoom)
        );
        return;
      }

      if (event.key === "-") {
        event.preventDefault();
        applyTransformEvent((current) =>
          zoomAtPoint(current, center, 1, minZoom, maxZoom)
        );
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        fitToContainerEvent();
      }
    };

    element.addEventListener("wheel", zoomFromWheel, { passive: false });
    window.addEventListener("keydown", zoomFromKeyboard);
    return () => {
      element.removeEventListener("wheel", zoomFromWheel);
      window.removeEventListener("keydown", zoomFromKeyboard);
    };
  }, [hydrated, maxZoom, minZoom]);

  const onNodePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode) => {
      if (!nodesDraggable || event.button !== 0) return;
      if (
        event.target instanceof Element &&
        event.target.closest("[data-entity-menu], button, a")
      ) {
        return;
      }
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      nodeDragRef.current = {
        pointerId: event.pointerId,
        nodeId: node.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: node.position.x,
        originY: node.position.y,
        moved: false,
      };
    },
    [nodesDraggable]
  );

  const onNodePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = nodeDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const screenDx = event.clientX - drag.startClientX;
      const screenDy = event.clientY - drag.startClientY;
      if (Math.hypot(screenDx, screenDy) > 4) {
        drag.moved = true;
      }

      const k = transformRef.current.k;
      setPositionOverrides((current) => ({
        ...current,
        [drag.nodeId]: {
          x: drag.originX + screenDx / k,
          y: drag.originY + screenDy / k,
        },
      }));
    },
    []
  );

  const onNodePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = nodeDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.moved) {
        suppressNodeClickRef.current = drag.nodeId;
      }
      nodeDragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    []
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (
        event.target instanceof Element &&
        event.target.closest("[data-graph-node]")
      ) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: transformRef.current.x,
        originY: transformRef.current.y,
      };
    },
    []
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (nodeDragRef.current) return;
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      applyTransform((current) => ({
        ...current,
        x: pan.originX + (event.clientX - pan.startX),
        y: pan.originY + (event.clientY - pan.startY),
      }));
    },
    [applyTransform]
  );

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (nodeDragRef.current) return;
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-graph-node], path")
      ) {
        return;
      }
      setSelectedEdgeId(null);
      onPaneClick?.();
    },
    [onPaneClick]
  );

  const surfaceStyle = graphCanvasDotStyle(transform);

  if (!hydrated) {
    return (
      <div
        className={cn(
          "relative h-full w-full overflow-hidden",
          GRAPH_CANVAS_BG_CLASS,
          className
        )}
        style={graphCanvasDotStyle()}
      >
        <GraphCanvasPendingShell className="h-full w-full" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring",
        GRAPH_CANVAS_BG_CLASS,
        className
      )}
      style={surfaceStyle}
      role="application"
      aria-label="Graph canvas"
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={handlePaneClick}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setSelectedEdgeId(null);
          onPaneClick?.();
        }
      }}
    >
      {viewReady ? (
        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
          }}
        >
          <svg
            className="pointer-events-none absolute overflow-visible"
            style={{ left: 0, top: 0, width: 1, height: 1 }}
            aria-hidden
          >
            <g className="pointer-events-auto">
              {edges.map((edge) => {
                const sourceNode = nodeMap.get(edge.source);
                const targetNode = nodeMap.get(edge.target);
                if (!sourceNode || !targetNode) return null;
                return (
                  <GraphEdgePath
                    key={edge.id}
                    edge={{
                      ...edge,
                      selected: selectedEdgeId === edge.id || edge.selected,
                    }}
                    sourceNode={sourceNode}
                    targetNode={targetNode}
                    zoom={transform.k}
                    onSelect={
                      onEdgeClick
                        ? (selected, clickEvent) => {
                            setSelectedEdgeId(selected.id);
                            onEdgeClick(
                              clickEvent,
                              selected
                            );
                          }
                        : undefined
                    }
                  />
                );
              })}
            </g>
          </svg>

          {displayNodes.map((node) => (
            <GraphNodeHitTarget
              key={node.id}
              node={node}
              nodesDraggable={nodesDraggable}
              actions={getNodeActions?.(node) ?? []}
              suppressNodeClickRef={suppressNodeClickRef}
              onNodePointerDown={onNodePointerDown}
              onNodePointerMove={onNodePointerMove}
              onNodePointerUp={onNodePointerUp}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      ) : (
        <GraphCanvasPendingShell className="absolute inset-0" />
      )}
    </div>
  );
}
