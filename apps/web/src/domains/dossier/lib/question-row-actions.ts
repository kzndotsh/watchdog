import type { AppAction } from "@/shared/lib/app-action";

export interface OpenQuestionRowActionHandlers {
  onEdit: () => void;
  onResolve: () => void;
}

export interface ResolvedQuestionRowActionHandlers {
  onEdit: () => void;
  onReopen: () => void;
}

/** Shared ⋯ + ContextMenu for open (unresolved) dossier questions. */
export function openQuestionRowActions(
  handlers: OpenQuestionRowActionHandlers
): AppAction[] {
  return [
    {
      id: "question-edit",
      label: "Edit",
      group: "target",
      run: handlers.onEdit,
    },
    {
      id: "question-resolve",
      label: "Resolve",
      group: "target",
      run: handlers.onResolve,
    },
  ];
}

/** Shared ⋯ + ContextMenu for resolved dossier questions. */
export function resolvedQuestionRowActions(
  handlers: ResolvedQuestionRowActionHandlers
): AppAction[] {
  return [
    {
      id: "question-edit",
      label: "Edit",
      group: "target",
      run: handlers.onEdit,
    },
    {
      id: "question-reopen",
      label: "Reopen",
      group: "target",
      run: handlers.onReopen,
    },
  ];
}
