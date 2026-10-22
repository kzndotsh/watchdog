import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

import { LibraryEntryAside } from "@/domains/library/components/library-entry-aside";
import { LibraryEntryHeader } from "@/domains/library/components/library-entry-header";
import { LibraryEntryMore } from "@/domains/library/components/library-entry-more";
import { LibraryEntrySection } from "@/domains/library/components/library-entry-section";
import { LibraryRunOn } from "@/domains/library/components/library-run-on";
import type { LibraryEntry } from "@/domains/library/types";
import { cn } from "@/lib/utils";
import {
  LIBRARY_ENTRY_BACK_ROW_CLASS,
  LIBRARY_ENTRY_COLUMNS_CLASS,
  LIBRARY_ENTRY_MAIN_CLASS,
  LIBRARY_ENTRY_TOP_CLASS,
} from "@/shared/ui/library-shell";

export type LibraryEntryLayoutProps = {
  entry: LibraryEntry;
  /** The aside's rows. */
  aside: ReactNode;
  /** The main column. */
  children: ReactNode;
};

/**
 * A Library entry's page body, shared by Caps and Playbooks: the header over the main column,
 * which ends with Run on…, beside a sticky aside that runs the full height (on a phone: header,
 * aside, main), then more entries from the same category. The loader supplies
 * the page frame around it.
 */
export function LibraryEntryLayout({
  entry,
  aside,
  children,
}: LibraryEntryLayoutProps) {
  return (
    <>
      <div className={LIBRARY_ENTRY_TOP_CLASS}>
        {/* The breadcrumb also links back; this says so in words for anyone who misses it. */}
        <Link
          to="/library"
          className={cn(
            LIBRARY_ENTRY_BACK_ROW_CLASS,
            "text-muted-foreground hover:text-foreground w-fit gap-1.5 text-xs"
          )}
        >
          <ArrowLeftIcon aria-hidden className="size-3.5" />
          Back
        </Link>
        <div className={LIBRARY_ENTRY_COLUMNS_CLASS}>
          <div className="min-w-0 lg:col-start-1">
            <LibraryEntryHeader entry={entry} />
          </div>
          <LibraryEntryAside entry={entry}>{aside}</LibraryEntryAside>
          <div className={LIBRARY_ENTRY_MAIN_CLASS}>
            {entry.description === "" ? null : (
              <p className="text-muted-foreground max-w-prose text-sm">
                {entry.description}
              </p>
            )}
            {children}
            <LibraryEntrySection title="Run it">
              <LibraryRunOn entry={entry} />
            </LibraryEntrySection>
          </div>
        </div>
      </div>
      <LibraryEntryMore entry={entry} />
    </>
  );
}
