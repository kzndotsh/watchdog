import { dossierTasksFallback } from "@/domains/dossier/components/dossier-tab-pending";
import type { DossierSectionProps } from "@/domains/dossier/types";
import { TaskBoard } from "@/domains/tasks/components/task-board";
import { TaskFormDialog } from "@/domains/tasks/components/task-form-dialog";
import { useTaskWorkspace } from "@/domains/tasks/hooks/use-task-workspace";
import { cn } from "@/lib/utils";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";

export function DossierTasksSection({ caseId, entityId }: DossierSectionProps) {
  const ws = useTaskWorkspace(caseId, { entityId, live: false });

  if (ws.pending) {
    return dossierTasksFallback();
  }

  return (
    <div
      className={cn(
        "border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border",
        placeholderDeemphasisClass(ws.tasksPlaceholder)
      )}
    >
      <TaskBoard
        items={ws.tasks}
        selectedId={ws.selected?.id}
        onSelect={ws.handleSelect}
        onDelete={(task) => {
          void ws.handleDelete(task);
        }}
        onCommitDrop={ws.handleCommitDrop}
        onQuickCreate={ws.handleQuickCreate}
        quickCreateBusy={ws.quickCreateBusy}
        entityById={ws.entityById}
      />

      <TaskFormDialog
        mode="edit"
        open={ws.selected !== null}
        onOpenChange={(open) => {
          if (!open) ws.closeSelected();
        }}
        task={ws.selected}
        entities={ws.entities}
        busy={ws.updateBusy}
        error={ws.formError}
        onSubmit={ws.handleUpdate}
        onDelete={ws.handleDelete}
      />
    </div>
  );
}
