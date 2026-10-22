import type { LibraryEntryFact } from "@/domains/library/lib/entry-facts";
import { cn } from "@/lib/utils";
import {
  LIBRARY_ENTRY_FACT_CLASS,
  LIBRARY_ENTRY_FACTS_CLASS,
} from "@/shared/ui/library-shell";

export type LibraryEntryFactsProps = {
  facts: readonly LibraryEntryFact[];
};

/** One quiet row: muted caption over a medium value, hairline dividers. Cells size to their values and wrap a long one rather than run into the next cell. */
export function LibraryEntryFacts({ facts }: LibraryEntryFactsProps) {
  return (
    <dl className={LIBRARY_ENTRY_FACTS_CLASS}>
      {facts.map((fact) => (
        <div
          key={fact.caption}
          className={cn(
            LIBRARY_ENTRY_FACT_CLASS,
            fact.isWide === true ? "grow-3" : "grow"
          )}
        >
          <dt className="text-muted-foreground text-xs">{fact.caption}</dt>
          <dd className="text-sm font-medium text-pretty">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
