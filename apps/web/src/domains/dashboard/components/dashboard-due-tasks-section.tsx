import { Link } from "@tanstack/react-router";

import { DashedEmpty } from "@/domains/dashboard/components/dashed-empty";
import { isTaskDueOverdue } from "@/domains/tasks/lib/due-date";
import type { TaskRecord } from "@/domains/tasks/types";
import { cn } from "@/lib/utils";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { Button } from "@/shared/ui/primitives/button";
import { SectionHeaderBar } from "@/shared/ui/section-header-bar";
import type { ListTotal } from "@watchdog/schemas/shared";

/** "and 12 more" / "and 990+ more" under the list, from the read's capped total. */
function moreLabel(shown: number, total: ListTotal | undefined): string | null {
  if (total === undefined || total.count <= shown) return null;
  const more = total.count - shown;
  return `and ${more.toLocaleString("en-US")}${total.isCapped ? "+" : ""} more`;
}

type DueBodyProps = {
  caseSlug: string | null;
  tasks: TaskRecord[];
  total: ListTotal | undefined;
};

function DueBody({ caseSlug, tasks, total }: DueBodyProps) {
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
  const more = moreLabel(tasks.length, total);
  return (
    <div className="space-y-2">
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
                    className={cn(
                      "line-clamp-2",
                      overdue && "text-destructive"
                    )}
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
      {more === null ? null : (
        <p className="text-muted-foreground text-xs">
          {more}:{" "}
          <Link
            to="/cases/$caseSlug/tasks"
            params={{ caseSlug }}
            className="underline-offset-2 hover:underline"
          >
            open the board
          </Link>
        </p>
      )}
    </div>
  );
}

type DashboardDueTasksSectionProps = {
  caseSlug: string | null;
  /** The first open Tasks overdue or due soon (`tasks.due`), soonest first. */
  tasks: TaskRecord[];
  /** How many there are in all (capped), for "and N more". */
  total?: ListTotal;
};

export function DashboardDueTasksSection({
  caseSlug,
  tasks,
  total,
}: DashboardDueTasksSectionProps) {
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
              variant="link-muted"
              size="inline"
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

      <DueBody caseSlug={caseSlug} tasks={tasks} total={total} />
    </section>
  );
}
