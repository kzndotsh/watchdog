import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { isTaskDueOverdue } from "@/domains/tasks/lib/due-date";
import type { TaskRecord } from "@/domains/tasks/types";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import { cn } from "@/lib/utils";
import { IdChip } from "@/shared/ui/id-chip";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { RelativeTime } from "@/shared/ui/relative-time";
import { SectionHeaderBar } from "@/shared/ui/section-header-bar";
import { Button } from "@/shared/ui/shadcn/button";

function DashedEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="border-border/60 text-muted-foreground flex min-h-24 items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-xs">
      {children}
    </div>
  );
}

function TriageBody({
  hasCase,
  proposals,
}: {
  hasCase: boolean;
  proposals: ProposalRecord[];
}) {
  if (!hasCase) {
    return (
      <DashedEmpty>
        Select a Case in the sidebar to see pending proposals.
      </DashedEmpty>
    );
  }
  if (proposals.length === 0) {
    return <DashedEmpty>Triage clear.</DashedEmpty>;
  }
  return (
    <ul className="border-border divide-border divide-y overflow-hidden rounded-md border">
      {proposals.map((p) => {
        const summary = p.summary?.trim();
        return (
          <li key={p.id}>
            <Link
              to="/triage"
              search={{ proposalId: p.id }}
              className="hover:bg-muted/40 flex items-start justify-between gap-3 px-3 py-2.5 text-sm transition-colors"
            >
              <span className="min-w-0">
                {summary ? (
                  <span className="line-clamp-2 font-medium">{summary}</span>
                ) : (
                  <span className="font-medium">
                    Proposal <IdChip value={p.id} />
                  </span>
                )}
              </span>
              <RelativeTime
                value={p.createdAt}
                className="text-label-mono-sm text-muted-foreground shrink-0 tabular-nums"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function DueBody({
  hasCase,
  tasks,
}: {
  hasCase: boolean;
  tasks: TaskRecord[];
}) {
  if (!hasCase) {
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
              to="/tasks"
              search={task.entityId ? { entityId: task.entityId } : undefined}
              className="hover:bg-muted/40 flex items-start justify-between gap-3 px-3 py-2.5 text-sm transition-colors"
            >
              <span className="min-w-0">
                <span
                  className={cn(
                    "line-clamp-2 font-medium",
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
                dateOnly
                className={cn(
                  "text-label-mono-sm shrink-0 tabular-nums",
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

export function DashboardTriageSection({
  hasCase,
  proposals,
}: {
  hasCase: boolean;
  proposals: ProposalRecord[];
}) {
  return (
    <section className="space-y-3" aria-label="Recent triage">
      <SectionHeaderBar
        variant="inline"
        title={
          <span className="text-muted-foreground font-normal tracking-wide normal-case">
            Triage
          </span>
        }
        action={
          hasCase ? (
            <Button
              variant="link"
              size="xs"
              className="text-muted-foreground h-auto p-0 text-xs"
              nativeButton={false}
              render={
                <Link
                  to="/triage"
                  search={
                    proposals[0] ? { proposalId: proposals[0].id } : undefined
                  }
                />
              }
            >
              Open
            </Button>
          ) : null
        }
      />

      <TriageBody hasCase={hasCase} proposals={proposals} />
    </section>
  );
}

export function DashboardDueTasksSection({
  hasCase,
  tasks,
}: {
  hasCase: boolean;
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
          hasCase ? (
            <Button
              variant="link"
              size="xs"
              className="text-muted-foreground h-auto p-0 text-xs"
              nativeButton={false}
              render={<Link to="/tasks" />}
            >
              Open
            </Button>
          ) : null
        }
      />

      <DueBody hasCase={hasCase} tasks={tasks} />
    </section>
  );
}
