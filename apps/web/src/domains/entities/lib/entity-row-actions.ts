import type { EntityRecord } from "@/domains/entities/types";
import type { AppAction } from "@/shared/lib/app-action";

export interface EntityRowActionHandlers {
  onOpenEntity: (entity: EntityRecord) => void;
  onCopyEntityLink: (entity: EntityRecord) => void;
  onCopyEntityMarkdown: (entity: EntityRecord) => void;
  onDeleteEntity: (entity: EntityRecord) => void;
}

/** Shared ⋯ + row ContextMenu actions for the Entities table. */
export function entityRowActions(
  row: EntityRecord,
  handlers: EntityRowActionHandlers
): AppAction[] {
  return [
    {
      id: "entity-open",
      label: "Open entity",
      group: "target",
      run: () => {
        handlers.onOpenEntity(row);
      },
    },
    {
      id: "entity-copy-link",
      label: "Copy link",
      group: "target",
      run: () => {
        handlers.onCopyEntityLink(row);
      },
    },
    {
      id: "entity-copy-md",
      label: "Copy Markdown",
      group: "target",
      run: () => {
        handlers.onCopyEntityMarkdown(row);
      },
    },
    {
      id: "entity-delete",
      label: "Delete",
      group: "target",
      destructive: true,
      run: () => {
        handlers.onDeleteEntity(row);
      },
    },
  ];
}
