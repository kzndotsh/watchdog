import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/shared/ui/shadcn/button";

export interface EgoMenuNode {
  id: string;
  label: string;
  slug: string;
}

export interface EgoMenuConnection {
  edgeId: string;
  label: string;
}

interface Props {
  x: number;
  y: number;
  node: EgoMenuNode;
  connections: EgoMenuConnection[];
  onClose: () => void;
  onEditEdge?: (edgeId: string) => void;
}

/** Lightweight node menu for the dossier neighborhood canvas. */
export function EgoNodeMenu({
  x,
  y,
  node,
  connections,
  onClose,
  onEditEdge,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) {
        return;
      }
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      className="bg-popover text-popover-foreground border-border fixed z-50 flex max-w-xs min-w-[12rem] flex-col gap-0 rounded-md border py-1 shadow-lg"
      style={{ left: x, top: y }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      <div className="text-muted-foreground truncate px-3 py-1 text-xs">
        {node.label}
      </div>
      <Button
        variant="ghost"
        role="menuitem"
        className="h-auto w-full justify-start rounded-none px-3 py-1.5"
        render={
          <Link
            to="/entities/$entitySlug"
            params={{ entitySlug: node.slug }}
            search={{ tab: "connections" }}
          />
        }
        nativeButton={false}
        onClick={onClose}
      >
        Open dossier
      </Button>
      {onEditEdge
        ? connections.map((c) => (
            <Button
              key={c.edgeId}
              variant="ghost"
              role="menuitem"
              className="h-auto w-full justify-start rounded-none px-3 py-1.5"
              onClick={() => {
                onEditEdge(c.edgeId);
                onClose();
              }}
            >
              {connections.length === 1
                ? "Edit connection…"
                : `Edit: ${c.label}`}
            </Button>
          ))
        : null}
    </div>,
    document.body
  );
}
