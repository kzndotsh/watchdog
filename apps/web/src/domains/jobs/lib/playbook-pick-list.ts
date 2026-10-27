import { z } from "zod";

import { PLAYBOOK_EGRESS_LABELS } from "@/domains/jobs/lib/playbook-match";
import {
  choices,
  defineList,
  EGRESS_CLASSES,
  flag,
  PLAYBOOK_SEED_KIND_LABELS,
  PLAYBOOK_SEED_KINDS,
} from "@watchdog/schemas/shared";

/**
 * The Playbook run form's picker, as a bounded list (#573, ADR-0007): the registry
 * (`capabilities.listPlaybooks`, a handful of entries) is read whole and narrowed in the browser
 * by `matchPlaybooks`. Declared here, not in `@watchdog/schemas`, because no procedure serves it;
 * the declaration gives the form the standard Filters popover and chips (`useBoundedList`), with
 * its view held in the form's state, never the URL. `egress` finds the Playbooks that need one of
 * the chosen classes.
 */
export const playbookPickList = defineList({
  name: "playbook-picker",
  noun: { one: "Playbook", many: "Playbooks" },
  scope: z.object({}),
  filters: {
    seed: choices("Seed", PLAYBOOK_SEED_KINDS, PLAYBOOK_SEED_KIND_LABELS),
    egress: choices("Egress", EGRESS_CLASSES, PLAYBOOK_EGRESS_LABELS),
    needsKey: flag("Needs key"),
    urlDump: flag("URL dump seed"),
  },
  sorts: {
    title: { label: "Title", type: "text", dirs: ["asc"] },
  },
  defaultSort: "title.asc",
});
