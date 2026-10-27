import { z } from "zod";

import { organizationIdSchema } from "./ids";
import { defineList } from "./lists/define-list";
import { flag } from "./lists/filter-kinds";

/**
 * The organization's Case list (ADR-0007): the live Cases the caller can see, for `wd cases list`
 * and `cases.list`. Like Deleted Cases it has no wire scope: the organization comes from the
 * caller (`context`), never from the input, the URL or the CLI flags. By name, so the list a
 * person scans stays in the order the Case picker uses. `localOnly` finds the Cases that allow
 * no egress beyond the install (their allowed egress is exactly `local`).
 */
export const caseList = defineList({
  name: "cases",
  noun: { one: "case", many: "cases" },
  scope: z.object({}),
  context: z.object({ organizationId: organizationIdSchema }),
  filters: {
    localOnly: flag("Local only"),
  },
  sorts: {
    name: { label: "Name", type: "text", dirs: ["asc", "desc"] },
    created: { label: "Created", type: "time", dirs: ["desc", "asc"] },
    updated: { label: "Updated", type: "time", dirs: ["desc", "asc"] },
  },
  defaultSort: "name.asc",
  search: {
    fields: ["name", "slug", "description"],
    hint: "name, link or description",
  },
});
