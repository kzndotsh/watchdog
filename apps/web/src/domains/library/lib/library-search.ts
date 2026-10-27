import { z } from "zod";

import { libraryList } from "@/domains/library/lib/library-list";
import {
  trimmedOrUndefined,
  type ListSearch,
  type ListSearchPatch,
} from "@watchdog/schemas/shared";

/** The category's short URL token: trimmed, blank is absent, junk is dropped. */
const category = z
  .unknown()
  .transform((value) =>
    typeof value === "string"
      ? trimmedOrUndefined(value)?.slice(0, 128)
      : undefined
  )
  .optional();

/**
 * The Library's URL state: the list's own params (`q`, the filters, `sort`) plus the category
 * the rail selects (`cat`), so a link can open "what takes an email address".
 */
export const librarySearchSchema = libraryList.searchWith({ cat: category });

export type LibrarySearch = ListSearch<typeof libraryList> & {
  readonly cat?: string | undefined;
};

/** What a change writes back: only the keys that changed (`undefined` removes one). */
export type LibrarySearchPatch = ListSearchPatch<typeof libraryList> & {
  readonly cat?: string | undefined;
};
