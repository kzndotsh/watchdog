import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

import { LibraryEgressMark } from "@/domains/library/components/library-egress-mark";
import { LibraryReadinessBadge } from "@/domains/library/components/library-readiness-badge";
import { LibraryReadinessNote } from "@/domains/library/components/library-readiness-note";
import { LibraryRunOn } from "@/domains/library/components/library-run-on";
import type { LibraryEntry } from "@/domains/library/types";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { Chip } from "@/shared/ui/chip";

export type LibraryEntryPageProps = {
  entry: LibraryEntry;
  /** The body for the entry's kind (Cap or Playbook). */
  children: ReactNode;
};

/**
 * The shared frame of a Library entry's page: back link, title, kind, providers, readiness
 * and its note, the egress mark and Run on…. The kind's own body is `children`.
 */
export function LibraryEntryPage({ entry, children }: LibraryEntryPageProps) {
  return (
    <Page>
      <PageHeader />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pt-2">
        <Link
          to="/library"
          search={{ id: undefined, kind: undefined }}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
        >
          <ArrowLeftIcon aria-hidden className="size-3.5" />
          Library
        </Link>
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading min-w-0 text-2xl font-semibold break-words">
              {entry.title}
            </h1>
            <Chip size="md">{entry.kind === "cap" ? "Cap" : "Playbook"}</Chip>
          </div>
          <p className="text-muted-foreground text-sm">
            {entry.providers.length === 0
              ? "No provider"
              : entry.providers.join(", ")}
          </p>
          {entry.description === "" ? null : (
            <p className="text-sm">{entry.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <LibraryReadinessBadge readiness={entry.readiness} />
            {entry.isThirdParty ? <LibraryEgressMark /> : null}
          </div>
          <LibraryReadinessNote entry={entry} />
          <LibraryRunOn entry={entry} />
        </header>
        {children}
      </div>
    </Page>
  );
}
