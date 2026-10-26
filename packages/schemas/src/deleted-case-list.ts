import { z } from "zod";

import { organizationIdSchema } from "./ids";
import { defineList } from "./lists/define-list";
import { flag } from "./lists/filter-kinds";

/**
 * The organization's Deleted Cases list (ADR-0007), for owners and admins. It has no wire scope:
 * the organization comes from the caller (`context`), so no `organizationId` is ever in the
 * input, the URL or the CLI flags. `deleted.desc` (newest deletion first) is the default; the
 * scheduled purge's order is not a view here.
 */
export const deletedCaseList = defineList({
  name: "deleted-cases",
  noun: { one: "deleted Case", many: "deleted Cases" },
  scope: z.object({}),
  context: z.object({ organizationId: organizationIdSchema }),
  filters: {
    /** A purge has begun: the Case can no longer be restored, only purged. */
    purging: flag("Purge started"),
  },
  sorts: {
    deleted: { label: "Deleted", type: "time", dirs: ["desc", "asc"] },
    name: { label: "Name", type: "text", dirs: ["asc", "desc"] },
  },
  defaultSort: "deleted.desc",
  search: {
    fields: ["name", "slug", "description"],
    hint: "name, link or description",
  },
});
