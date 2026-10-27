import { Link } from "@tanstack/react-router";

import { LibraryEntryLayout } from "@/domains/library/components/library-entry-layout";
import { LibraryEntryMeta } from "@/domains/library/components/library-entry-meta";
import { LibraryEntrySection } from "@/domains/library/components/library-entry-section";
import { LibraryPlaybookStages } from "@/domains/library/components/library-playbook-stages";
import { usePlaybookFlow } from "@/domains/library/hooks/use-playbook-flow";
import { inputKindLabel } from "@/domains/library/lib/input-kinds";
import { dataLabel } from "@/domains/library/lib/library-entries";
import {
  rollUpReadiness,
  rollupSummary,
} from "@/domains/library/lib/playbook-rollup";
import type { LibraryEntry } from "@/domains/library/types";

export type LibraryPlaybookDetailProps = {
  entry: LibraryEntry;
};

/**
 * A Playbook's Library page: the steps as stages of a dependency graph (picking "If step N
 * fails" shows what that skips) and, in the aside, a readiness roll-up when a step cannot run and the seed kinds
 * it starts from, each opening the Library's "start from what you have" view.
 */
export function LibraryPlaybookDetail({ entry }: LibraryPlaybookDetailProps) {
  const { steps, inputKinds, providers } = entry;
  const flow = usePlaybookFlow(entry);
  const rollup = rollUpReadiness(steps);
  const isAllReady = rollup.counts.ready === rollup.total;

  return (
    <LibraryEntryLayout
      entry={entry}
      statusDetail={isAllReady ? undefined : rollupSummary(rollup)}
      aside={
        <>
          <LibraryEntryMeta label="Starts from">
            {inputKinds.length === 0
              ? "Nothing"
              : inputKinds.map((kind, i) => (
                  <span key={kind}>
                    {i === 0 ? "" : ", "}
                    <Link
                      to="/library"
                      search={{ kind: [kind] }}
                      className="text-primary hover:underline"
                    >
                      {inputKindLabel(kind)}
                    </Link>
                  </span>
                ))}
          </LibraryEntryMeta>
          <LibraryEntryMeta label="Providers">
            {providers.length === 0 ? "None" : providers.join(", ")}
          </LibraryEntryMeta>
          <LibraryEntryMeta label="Steps">{steps.length}</LibraryEntryMeta>
          <LibraryEntryMeta label="Data">{dataLabel(entry)}</LibraryEntryMeta>
          <LibraryEntryMeta label="Id">
            <span className="font-mono text-xs break-all">{entry.id}</span>
          </LibraryEntryMeta>
        </>
      }
    >
      <LibraryEntrySection title="How it runs">
        <LibraryPlaybookStages
          steps={steps}
          gives={flow.gives}
          gets={flow.gets}
        />
      </LibraryEntrySection>
    </LibraryEntryLayout>
  );
}
