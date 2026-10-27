import { z } from "zod";

import { choices, defineList, flag, tags } from "@watchdog/schemas/shared";

/** The Cap kinds the run form offers, with their labels. */
const CAP_KINDS = ["collect", "enrich", "process", "act"] as const;
const CAP_KIND_LABELS: Record<(typeof CAP_KINDS)[number], string> = {
  collect: "Collect",
  enrich: "Enrich",
  process: "Process",
  act: "Act",
};

/** What a Cap is for, as its catalog entry states it (`useCases`). */
const CAP_INTENTS = ["Passive", "Active", "Footprint"] as const;
const CAP_INTENT_LABELS: Record<(typeof CAP_INTENTS)[number], string> = {
  Passive: "Passive",
  Active: "Active",
  Footprint: "Footprint",
};

/** The longest Cap category the `category` filter takes (an id's first segment). */
const CAP_CATEGORY_MAX = 40;

/**
 * The Cap run form's picker, as a bounded list (#573, ADR-0007): the catalog (`capabilities.list`,
 * about sixty entries) is read whole and narrowed in the browser by `matchCaps`. Declared here,
 * not in `@watchdog/schemas`, because no procedure serves it; the declaration gives the form the
 * standard Filters popover and chips (`useBoundedList`), with its view held in the form's state,
 * never the URL. `category` is any of the catalog's categories (its options come from the form).
 */
export const capPickList = defineList({
  name: "cap-picker",
  noun: { one: "Cap", many: "Caps" },
  scope: z.object({}),
  filters: {
    kind: choices("Kind", CAP_KINDS, CAP_KIND_LABELS),
    category: tags("Category", { maxLength: CAP_CATEGORY_MAX }),
    intent: choices("Intent", CAP_INTENTS, CAP_INTENT_LABELS),
    needsKey: flag("Needs key"),
  },
  sorts: {
    title: { label: "Title", type: "text", dirs: ["asc"] },
  },
  defaultSort: "title.asc",
});
