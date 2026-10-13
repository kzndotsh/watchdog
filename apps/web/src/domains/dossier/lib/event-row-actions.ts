import type { AppAction } from "@/shared/lib/app-action";

export type EventRowActionHandlers = {
  onEdit: () => void;
  onDelete: () => void;
};

/** Shared ⋯ + ContextMenu actions for dossier event rows. */
export function eventRowActions(handlers: EventRowActionHandlers): AppAction[] {
  return [
    {
      id: "event-edit",
      label: "Edit",
      group: "target",
      run: handlers.onEdit,
    },
    {
      id: "event-delete",
      label: "Delete",
      group: "target",
      isDestructive: true,
      run: handlers.onDelete,
    },
  ];
}
