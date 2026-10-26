import { dossierTasksFallback } from "@/domains/dossier/components/dossier-tab-pending";
import type { DossierSectionProps } from "@/domains/dossier/types";
import { TaskBoard } from "@/domains/tasks/components/task-board";
import { LazyTaskFormDialog } from "@/domains/tasks/components/task-form-dialog-lazy";
import { useTaskWorkspace } from "@/domains/tasks/hooks/use-task-workspace";
import type { TaskEntityLabel } from "@/domains/tasks/types";
import { cn } from "@/lib/utils";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { FieldError } from "@watchdog/ui/components/field";

type DossierTasksSectionProps = Pick<DossierSectionProps, "caseId"> & {
  /** The Dossier's Entity: every task on this board is its own, so no Entity list is read. */
  entity: TaskEntityLabel;
};

export function DossierTasksSection({
  caseId,
  entity,
}: DossierTasksSectionProps) {
  const ws = useTaskWorkspace(caseId, { entity });

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
      <FieldError>{ws.quickCreateError}</FieldError>
      <TaskBoard
        items={ws.tasks}
        selectedId={ws.selected?.id}
        onSelect={ws.handleSelect}
        onDelete={(task) => {
          void ws.handleDelete(task);
        }}
        onCommitDrop={ws.handleCommitDrop}
        onQuickCreate={ws.handleQuickCreate}
        isQuickCreateBusy={ws.quickCreateBusy}
        entityById={ws.entityById}
      />

      <LazyTaskFormDialog
        mode="edit"
        open={ws.selected !== null}
        onOpenChange={(open) => {
          if (!open) ws.closeSelected();
        }}
        task={ws.selected}
        caseId={caseId}
        isBusy={ws.updateBusy}
        error={ws.formError}
        onSubmit={ws.handleUpdate}
        onDelete={ws.handleDelete}
      />
    </div>
  );
}
