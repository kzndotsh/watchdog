import { z } from "zod";

import { COMMERCIAL_USE_LABELS } from "@/domains/library/lib/cap-detail";
import { READINESS_LABELS } from "@/domains/library/lib/library-readiness";
import {
  COMMERCIAL_USE_VALUES,
  LIBRARY_READINESS_STATES,
} from "@/domains/library/types";
import {
  choices,
  defineList,
  flag,
  tags,
  type ListQuery,
} from "@watchdog/schemas/shared";

/** The longest input kind the `kind` filter takes (`email`, `url_archive`). */
const INPUT_KIND_MAX = 40;

/**
 * The Library's list declaration (#573, ADR-0007): a BOUNDED list, so its data is the registry
 * read the page already holds (`capabilities.list`, `capabilities.listPlaybooks`) and it is
 * filtered in the browser (`filterLibraryEntries`). It is declared here, not in
 * `@watchdog/schemas`, because no procedure serves it. The declaration gives the screen what a
 * server list has: the canonical query, the URL (`libraryList.searchWith`), and the standard
 * toolbar's Filters popover, chips and Display options (`useBoundedList`).
 *
 * `kind` is "start from what you have": the entries that take any of the chosen input kinds (its
 * options are the kinds the registry's entries take, from the screen). The one sort is the order
 * the grid already had, ready entries first and then by title inside each category.
 */
export const libraryList = defineList({
  name: "library",
  noun: { one: "entry", many: "entries" },
  scope: z.object({}),
  filters: {
    kind: tags("Takes", { maxLength: INPUT_KIND_MAX }),
    readiness: choices("Readiness", LIBRARY_READINESS_STATES, READINESS_LABELS),
    thirdParty: flag("Sends data to a third party"),
    commercialUse: choices(
      "Provider commercial use",
      COMMERCIAL_USE_VALUES,
      COMMERCIAL_USE_LABELS
    ),
  },
  sorts: {
    readiness: { label: "Ready first", type: "text", dirs: ["asc"] },
  },
  defaultSort: "readiness.asc",
  search: {
    fields: ["title"],
    hint: "title, id, provider or description",
  },
});

export type LibraryQuery = ListQuery<typeof libraryList>;
