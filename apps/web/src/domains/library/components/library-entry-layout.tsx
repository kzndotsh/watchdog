import type { ReactNode } from "react";

import { LibraryEntryAside } from "@/domains/library/components/library-entry-aside";
import { LibraryEntryFacts } from "@/domains/library/components/library-entry-facts";
import { LibraryEntryHeader } from "@/domains/library/components/library-entry-header";
import { LibraryEntryMore } from "@/domains/library/components/library-entry-more";
import type { LibraryEntryFact } from "@/domains/library/lib/entry-facts";
import type { LibraryEntry } from "@/domains/library/types";
import {
  LIBRARY_ENTRY_COLUMNS_CLASS,
  LIBRARY_ENTRY_MAIN_CLASS,
} from "@/shared/ui/library-shell";

export type LibraryEntryLayoutProps = {
  entry: LibraryEntry;
  facts: readonly LibraryEntryFact[];
  /** The aside's rows. */
  aside: ReactNode;
  /** The main column. */
  children: ReactNode;
};

/**
 * A Library entry's page body, shared by Caps and Playbooks: header, facts strip, the main
 * column beside a sticky aside, then more entries from the same category. The loader supplies
 * the page frame around it.
 */
export function LibraryEntryLayout({
  entry,
  facts,
  aside,
  children,
}: LibraryEntryLayoutProps) {
  return (
    <>
      <LibraryEntryHeader entry={entry} />
      <LibraryEntryFacts facts={facts} />
      <div className={LIBRARY_ENTRY_COLUMNS_CLASS}>
        <div className={LIBRARY_ENTRY_MAIN_CLASS}>
          {entry.description === "" ? null : (
            <p className="text-muted-foreground max-w-prose text-sm">
              {entry.description}
            </p>
          )}
          {children}
        </div>
        <LibraryEntryAside entry={entry}>{aside}</LibraryEntryAside>
      </div>
      <LibraryEntryMore entry={entry} />
    </>
  );
}
