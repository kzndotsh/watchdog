import type { CaseRecord } from "@/domains/cases/types";
import type { AppAction } from "@/shared/lib/app-action";

export interface CaseCardActionHandlers {
  onOpen: () => void;
  onSetActiveOnly?: () => void;
  onDelete: () => void;
  selecting?: boolean;
}

/** Shared ⋯ + ContextMenu actions for Manage Cases cards. */
export function caseCardActions(
  _caseRow: CaseRecord,
  handlers: CaseCardActionHandlers
): AppAction[] {
  const selecting = handlers.selecting ?? false;
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
  actions.push({
    id: "case-delete",
    label: "Delete",
    group: "target",
    destructive: true,
    run: handlers.onDelete,
  });
  return actions;
}
