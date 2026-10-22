import type { LibraryEntryFact } from "@/domains/library/lib/entry-facts";
import {
  LIBRARY_ENTRY_FACT_CLASS,
  LIBRARY_ENTRY_FACTS_CLASS,
} from "@/shared/ui/library-shell";

export type LibraryEntryFactsProps = {
  facts: readonly LibraryEntryFact[];
};

/** One quiet row: muted caption over a medium value, hairline dividers, scrolls sideways. */
export function LibraryEntryFacts({ facts }: LibraryEntryFactsProps) {
  return (
    <dl className={LIBRARY_ENTRY_FACTS_CLASS}>
      {facts.map((fact) => (
        <div key={fact.caption} className={LIBRARY_ENTRY_FACT_CLASS}>
          <dt className="text-muted-foreground text-xs">{fact.caption}</dt>
          <dd className="text-sm font-medium whitespace-nowrap">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
