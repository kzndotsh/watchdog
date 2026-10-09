import type { AppAction } from "@/shared/lib/app-action";

/** Minimal row shape for identifier ⋯ / ContextMenu factories. */
export interface IdentifierRowActionTarget {
  id: string;
  value: string;
}

export interface IdentifierRowActionHandlers<
  T extends IdentifierRowActionTarget = IdentifierRowActionTarget,
> {
  onOpenSubject?: (row: T) => void;
  onCopyValue: (value: string) => void;
  onDeleteIdentifier: (row: T) => void;
}

/** Shared ⋯ + ContextMenu actions for Identifiers page and Dossier tab. */
export function identifierRowActions<T extends IdentifierRowActionTarget>(
  row: T,
  handlers: IdentifierRowActionHandlers<T>
): AppAction[] {
  const actions: AppAction[] = [];
  if (handlers.onOpenSubject) {
    const onOpen = handlers.onOpenSubject;
    actions.push({
      id: "identifier-open",
      label: "Open identifier",
      group: "target",
      run: () => {
        onOpen(row);
      },
    });
  }
  actions.push(
    {
      id: "identifier-copy",
      label: "Copy value",
      group: "target",
      run: () => {
        handlers.onCopyValue(row.value);
      },
    },
    {
      id: "identifier-delete",
      label: "Delete",
      group: "target",
      destructive: true,
      run: () => {
        handlers.onDeleteIdentifier(row);
      },
    }
  );
  return actions;
}
