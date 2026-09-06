import type { EdgeRecord } from "@/domains/entities/edges/edges.functions";
import type { AppAction } from "@/shared/lib/app-action";

export interface ConnectionRowActionHandlers {
  onOpenPeer: (edge: EdgeRecord) => void;
  onEdit: (edge: EdgeRecord) => void;
  onRemove: (edgeId: string) => void;
}

/** Shared ⋯ + ContextMenu actions for dossier connection rows. */
export function connectionRowActions(
  edge: EdgeRecord,
  handlers: ConnectionRowActionHandlers
): AppAction[] {
  return [
    {
      id: "connection-open-peer",
      label: "Open peer",
      group: "target",
      run: () => {
        handlers.onOpenPeer(edge);
      },
    },
    {
      id: "connection-edit",
      label: "Edit",
      group: "target",
      run: () => {
        handlers.onEdit(edge);
      },
    },
    {
      id: "connection-remove",
      label: "Remove",
      group: "target",
      destructive: true,
      run: () => {
        handlers.onRemove(edge.id);
      },
    },
  ];
}
