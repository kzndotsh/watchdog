import type { ReactNode } from "react";

import { LibraryReadinessNote } from "@/domains/library/components/library-readiness-note";
import { LibraryRunOn } from "@/domains/library/components/library-run-on";
import type { LibraryEntry } from "@/domains/library/types";
import { LIBRARY_ENTRY_ASIDE_CLASS } from "@/shared/ui/library-shell";

export type LibraryEntryAsideProps = {
  entry: LibraryEntry;
  children: ReactNode;
};

/**
 * The sticky right column, headed by Run on…: a hairline on its left edge from the top of the
 * page (top edge when stacked), no box.
 */
export function LibraryEntryAside({ entry, children }: LibraryEntryAsideProps) {
  return (
    <aside className={LIBRARY_ENTRY_ASIDE_CLASS}>
      <LibraryRunOn entry={entry} />
      {entry.readiness.state === "ready" ? null : (
        <div className="text-muted-foreground">
          <LibraryReadinessNote entry={entry} />
        </div>
      )}
      {children}
    </aside>
  );
}
