import { JOB_STATUS_LABELS } from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { defineList } from "./lists/define-list";
import { choices, ref, tags } from "./lists/filter-kinds";
import { JOB_STATUSES } from "./vocab";

/** The longest Cap id the `capability` filter takes. */
const JOB_CAPABILITY_ID_MAX = 200;

/**
 * The Case's Job list (ADR-0007): every Job of a Case, most recently updated first, for
 * `jobs.listForCase` and `wd jobs list`. (Collect's queue, `collectList`, is the screen that
 * groups Jobs into runs and Evidence; this one is the flat feed.) A playbook run's steps are
 * this list with `playbookRunId` set. `q` matches the Cap id, the result summary and the
 * error, plus the status labels.
 */
export const jobList = defineList({
  name: "jobs",
  noun: { one: "job", many: "jobs" },
  scope: caseScopeInputSchema,
  filters: {
    status: choices("Status", JOB_STATUSES, JOB_STATUS_LABELS),
    capability: tags("Cap", { maxLength: JOB_CAPABILITY_ID_MAX }),
    playbookRunId: ref("Playbook run", "playbook-run"),
  },
  sorts: {
    updated: { label: "Updated", type: "time", dirs: ["desc", "asc"] },
    created: { label: "Created", type: "time", dirs: ["desc", "asc"] },
  },
  defaultSort: "updated.desc",
  search: {
    fields: ["capabilityId", "resultSummary", "error"],
    hint: "Cap, result or error",
  },
});
