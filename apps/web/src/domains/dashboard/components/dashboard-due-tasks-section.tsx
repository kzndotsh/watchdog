import { Link } from "@tanstack/react-router";

import { DashedEmpty } from "@/domains/dashboard/components/dashed-empty";
import { isTaskDueOverdue } from "@/domains/tasks/lib/due-date";
import type { TaskRecord } from "@/domains/tasks/types";
import { cn } from "@/lib/utils";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { Button } from "@/shared/ui/primitives/button";
import { SectionHeaderBar } from "@/shared/ui/section-header-bar";

function DueBody({
  caseSlug,
  tasks,
}: {
  caseSlug: string | null;
  tasks: TaskRecord[];
}) {
  if (caseSlug === null) {
    return (
      <DashedEmpty>
        Overdue and near-due tasks show up once a Case is active.
      </DashedEmpty>
    );
  }
  if (tasks.length === 0) {
    return <DashedEmpty>No overdue or due within 7 days.</DashedEmpty>;
  }
  return (
    <ul className="border-border divide-border divide-y overflow-hidden rounded-md border">
      {tasks.map((task) => {
        const overdue = isTaskDueOverdue(task.dueDate, task.status);
        return (
          <li key={task.id}>
            <Link
              to="/cases/$caseSlug/tasks"
              params={{ caseSlug }}
              search={{
                taskId: task.id,
                ...(task.entityId ? { entityId: task.entityId } : {}),
              }}
              className="hover:bg-muted/40 flex items-start justify-between gap-3 px-3 py-2.5 text-sm transition-colors"
            >
              <span className="min-w-0">
                <span
                  className={cn("line-clamp-2", overdue && "text-destructive")}
                >
                  {task.title}
                </span>
                {overdue ? (
                  <span className="text-destructive mt-0.5 block text-xs">
                    Overdue
                  </span>
                ) : null}
              </span>
              <LocalDateTime
                value={task.dueDate}
                isDateOnly
                className={cn(
                  "text-2xs shrink-0 font-mono font-light tabular-nums",
                  overdue && "text-destructive"
                )}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardDueTasksSection({
  caseSlug,
  tasks,
}: {
  caseSlug: string | null;
  tasks: TaskRecord[];
}) {
  return (
    <section className="space-y-3" aria-label="Due tasks">
      <SectionHeaderBar
        variant="inline"
        title={
          <span className="text-muted-foreground font-normal tracking-wide normal-case">
            Due
          </span>
        }
        action={
          caseSlug === null ? null : (
            <Button
              variant="link"
              size="inline"
              className="text-muted-foreground text-xs"
              nativeButton={false}
              render={
                <Link to="/cases/$caseSlug/tasks" params={{ caseSlug }} />
              }
            >
              Open
            </Button>
          )
        }
      />

      <DueBody caseSlug={caseSlug} tasks={tasks} />
    </section>
  );
}
