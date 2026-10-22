import type { ReactNode } from "react";

import { LibraryReadinessNote } from "@/domains/library/components/library-readiness-note";
import type { LibraryEntry } from "@/domains/library/types";
import { LIBRARY_ENTRY_ASIDE_CLASS } from "@/shared/ui/library-shell";

export type LibraryEntryAsideProps = {
  entry: LibraryEntry;
  children: ReactNode;
};

/** The sticky right column: a hairline on its left edge (top edge when stacked), no box. */
export function LibraryEntryAside({ entry, children }: LibraryEntryAsideProps) {
  return (
    <aside className={LIBRARY_ENTRY_ASIDE_CLASS}>
      {entry.readiness.state === "ready" ? null : (
        <div className="text-muted-foreground">
          <LibraryReadinessNote entry={entry} />
        </div>
      )}
      {children}
    </aside>
  );
}
