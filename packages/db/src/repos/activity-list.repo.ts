import { and, eq } from "drizzle-orm";

import { activityList } from "@watchdog/schemas/feed";
import { parseTrimmedCaseId } from "@watchdog/schemas/shared";

import { activity } from "../schema/activity";
import { cases } from "../schema/cases";
import {
  feedAdmitted,
  inVisibleCase,
  newestOfGroup,
  noEntry,
} from "./_activity-feed";
import { defineListRepo } from "./_list-query";

/**
 * Recent activity (`activityList`, ADR-0007): the organization's log through the `FEED_ACTIONS`
 * allowlist, one row per run (`newestOfGroup`), tombstoned Cases left out, newest first. The
 * row is the log entry with its Case's name; labels and actor names are resolved by core.
 * Reads the log only, never the Evidence, Job or Proposal tables.
 * `activity_org_created_idx (organization_id, created_at desc, id desc)` serves both
 * directions; the Case filter has `activity_org_case_created_idx`.
 */
export const activityListRepo = defineListRepo(activityList, {
  table: activity,
  base: (exec, listKey) =>
    exec
      .select({
        id: activity.id,
        caseId: activity.caseId,
        caseName: cases.name,
        kind: activity.kind,
        action: activity.action,
        subjectId: activity.subjectId,
        groupId: activity.groupId,
        label: activity.label,
        fromValue: activity.fromValue,
        toValue: activity.toValue,
        actorId: activity.actorId,
        actorLabel: activity.actorLabel,
        at: activity.createdAt,
        listKey,
      })
      .from(activity)
      .innerJoin(cases, eq(cases.id, activity.caseId))
      .$dynamic(),
  id: activity.id,
  scopeColumn: activity.organizationId,
  scope: ({ organizationId }) =>
    and(
      eq(activity.organizationId, organizationId),
      feedAdmitted,
      inVisibleCase,
      newestOfGroup
    ) ?? noEntry,
  filters: {
    caseId: (id) => {
      if (id === null) return;
      const caseId = parseTrimmedCaseId(id);
      // A value that is no Case id names no entry.
      return caseId === null ? noEntry : eq(activity.caseId, caseId);
    },
  },
  selective: { caseId: activity.caseId },
  sorts: { at: activity.createdAt },
  search: undefined,
});

/** An entry of Recent activity: the log row, its Case's name and its cursor value. */
export type ActivityFeedRow = Awaited<
  ReturnType<typeof activityListRepo.page>
>[number];
