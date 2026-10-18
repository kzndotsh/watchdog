import type { CaseRecord } from "@/domains/cases/types";
import type { AppAction } from "@/shared/lib/app-action";

export type CaseCardActionHandlers = {
  onOpen: () => void;
  onSetActiveOnly?: () => void;
  /** Omitted for a caller who may not delete Cases (not an owner or admin): the action is not offered. */
  onDelete?: () => void;
  isSelecting?: boolean;
};

/** Shared ⋯ + ContextMenu actions for Manage Cases cards. */
export function caseCardActions(
  _caseRow: CaseRecord,
  handlers: CaseCardActionHandlers
): AppAction[] {
  const selecting = handlers.isSelecting ?? false;
  const actions: AppAction[] = [
    {
      id: "case-open",
      label: "Open",
      group: "target",
      disabled: selecting,
      run: handlers.onOpen,
    },
  ];
  if (handlers.onSetActiveOnly) {
    actions.push({
      id: "case-set-active",
      label: "Set as active case",
      group: "target",
      disabled: selecting,
      run: handlers.onSetActiveOnly,
    });
  }
  const { onDelete } = handlers;
  if (onDelete) {
    actions.push({
      id: "case-delete",
      label: "Delete",
      group: "target",
      isDestructive: true,
      run: onDelete,
    });
  }
  return actions;
}
