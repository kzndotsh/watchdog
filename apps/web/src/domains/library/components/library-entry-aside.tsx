import type { ReactNode } from "react";

import { LibraryReadinessNote } from "@/domains/library/components/library-readiness-note";
import type { LibraryEntry } from "@/domains/library/types";
import { LIBRARY_ENTRY_ASIDE_CLASS } from "@/shared/ui/library-shell";

export type LibraryEntryAsideProps = {
  entry: LibraryEntry;
  /** A line in the Status block, such as a Playbook's step roll-up. */
  statusDetail?: ReactNode;
  children: ReactNode;
};

/**
 * The sticky right column: a hairline on its left edge from the top of the page (top edge when
 * stacked), no box. It holds only the entry's details; Run on… closes the main column.
 */
export function LibraryEntryAside({
  entry,
  statusDetail,
  children,
}: LibraryEntryAsideProps) {
  return (
    <aside className={LIBRARY_ENTRY_ASIDE_CLASS}>
      <LibraryReadinessNote entry={entry} detail={statusDetail} />
      {children}
    </aside>
  );
}
