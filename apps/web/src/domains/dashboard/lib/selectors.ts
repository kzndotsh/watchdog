import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { LIVE_STATUSES } from "@/domains/jobs/lib/status";
import { isTaskDueOverdue, isTaskDueSoon } from "@/domains/tasks/lib/due-date";
import type { TaskRecord } from "@/domains/tasks/types";
import type { ProposalRecord } from "@/domains/triage/triage.functions";

const MAX_LIST_ROWS = 8;
const NEAR_DUE_DAYS = 7;

export function selectRecentProposals(
  proposals: ProposalRecord[],
  limit = MAX_LIST_ROWS
): ProposalRecord[] {
  return [...proposals]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

export function selectDueTasks(
  tasks: TaskRecord[],
  limit = MAX_LIST_ROWS
): TaskRecord[] {
  return tasks
    .filter(
      (task) =>
        isTaskDueOverdue(task.dueDate, task.status) ||
        isTaskDueSoon(task.dueDate, task.status, NEAR_DUE_DAYS)
    )
    .sort((a, b) => {
      const aOverdue = isTaskDueOverdue(a.dueDate, a.status) ? 0 : 1;
      const bOverdue = isTaskDueOverdue(b.dueDate, b.status) ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      const aDue = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
      const bDue = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    })
    .slice(0, limit);
}

export function countOverdueTasks(tasks: TaskRecord[]): number {
  return tasks.filter((t) => isTaskDueOverdue(t.dueDate, t.status)).length;
}

export function countNearDueTasks(tasks: TaskRecord[]): number {
  return tasks.filter((t) => isTaskDueSoon(t.dueDate, t.status, NEAR_DUE_DAYS))
    .length;
}

export function countLiveJobs(jobs: JobListRecord[]): number {
  return jobs.filter((job) => LIVE_STATUSES.has(job.status)).length;
}
