import { z } from "zod";

import { organizationIdSchema } from "./ids";
import { defineList } from "./lists/define-list";
import { ref } from "./lists/filter-kinds";

/**
 * The `(kind, action)` pairs of the activity log the workspace feed shows (ADR-0005 decision 5);
 * everything else in the log drives the live signal only. Task edits that keep the status and
 * reorders are in the log (they notify) but not in the feed, as before. Evidence shows when it
 * was captured (hide, restore, attach and process are not feed rows, as before). Proposals show
 * as history: proposed, then accepted or rejected (ADR-0005 "As built: S6"). Graph and Case
 * entries stay out: widening the feed to them is a product decision.
 */
export const FEED_ACTIONS = {
  task: ["created", "status_changed", "deleted"],
  job: ["queued", "running", "succeeded", "failed", "cancelled"],
  evidence: ["captured"],
  proposal: ["created", "accepted", "rejected"],
  open_in: ["opened"],
} as const;

/** A short dashboard feed: its own default and maximum page size. */
const ACTIVITY_PAGE_LIMIT = { default: 15, max: 50 } as const;

/**
 * Recent activity (ADR-0005 decision 5, ADR-0007): the organization's activity log through the
 * `FEED_ACTIONS` allowlist, newest first, one row per run (only the newest entry of a `group_id`
 * shows), for `activity.listRecent` and the dashboard and Case feeds. No wire scope: the
 * organization comes from the caller (`context`). The Case is a filter (the dashboard's Case
 * picker). A row's id is the log's integer id, so the cursor carries digits, not a uuid.
 */
export const activityList = defineList({
  name: "activity",
  noun: { one: "activity entry", many: "activity entries" },
  scope: z.object({}),
  context: z.object({ organizationId: organizationIdSchema }),
  idType: "int",
  filters: {
    caseId: ref("Case", "case"),
  },
  sorts: {
    at: { label: "Time", type: "time", dirs: ["desc", "asc"] },
  },
  defaultSort: "at.desc",
  limit: ACTIVITY_PAGE_LIMIT,
});
