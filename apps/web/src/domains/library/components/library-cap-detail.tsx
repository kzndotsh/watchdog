import { Link } from "@tanstack/react-router";

import { LibraryCapFlow } from "@/domains/library/components/library-cap-flow";
import { LibraryCapRequirements } from "@/domains/library/components/library-cap-requirements";
import { LibraryEntryLayout } from "@/domains/library/components/library-entry-layout";
import { LibraryEntryMeta } from "@/domains/library/components/library-entry-meta";
import { LibraryEntryRow } from "@/domains/library/components/library-entry-row";
import { LibraryEntrySection } from "@/domains/library/components/library-entry-section";
import { useCapDetail } from "@/domains/library/hooks/use-cap-detail";
import { useLibraryData } from "@/domains/library/hooks/use-library-data";
import {
  buildCapRequirements,
  COMMERCIAL_USE_LABELS,
  PROVIDER_TIER_LABELS,
} from "@/domains/library/lib/cap-detail";
import type { LibraryEntry } from "@/domains/library/types";
import { ExternalHostLink } from "@/shared/ui/external-host-link";

export type LibraryCapDetailProps = {
  entry: LibraryEntry;
};

const LINK_CLASS = "text-primary hover:underline";

/**
 * A Cap's Library page: what it takes and returns, how it behaves, the Playbooks that run it,
 * and in the aside who provides the data and which keys it reads. Every line comes from the
 * Cap's descriptor, never from copy written for one Cap.
 */
export function LibraryCapDetail({ entry }: LibraryCapDetailProps) {
  const detail = useCapDetail(entry.id);
  const { configured } = useLibraryData();
  if (detail === null) return null;
  const { cap, view, hasPlaybooks } = detail;
  const { provider, dataSource } = cap;

  return (
    <LibraryEntryLayout
      entry={entry}
      aside={
        <>
          <LibraryEntryMeta label="Provider">
            <a
              href={provider.url}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              {provider.name}
            </a>
          </LibraryEntryMeta>
          <LibraryEntryMeta label="Plan">
            {PROVIDER_TIER_LABELS[provider.tier]}
          </LibraryEntryMeta>
          <LibraryEntryMeta label="Commercial use">
            {COMMERCIAL_USE_LABELS[provider.commercialUse]}
          </LibraryEntryMeta>
          <LibraryEntryMeta label="Terms">
            <ExternalHostLink href={provider.termsUrl} />
          </LibraryEntryMeta>
          {dataSource === undefined ? null : (
            <LibraryEntryMeta label="Data source">
              {dataSource}
            </LibraryEntryMeta>
          )}
          {provider.attribution === undefined ? null : (
            <LibraryEntryMeta label="Credit">
              <ExternalHostLink href={provider.attribution.url} />
            </LibraryEntryMeta>
          )}
          <LibraryEntryMeta label="Requirements">
            <LibraryCapRequirements
              requirements={buildCapRequirements(view.credentials, configured)}
            />
          </LibraryEntryMeta>
          <LibraryEntryMeta label="Id">
            <span className="font-mono text-xs break-all">{entry.id}</span>
          </LibraryEntryMeta>
        </>
      }
    >
      <LibraryEntrySection title="How it works">
        <LibraryCapFlow
          consumes={view.consumes}
          produces={view.produces}
          runner={entry.isThirdParty ? provider.name : "This server"}
          title={entry.title}
        />
      </LibraryEntrySection>

      <LibraryEntrySection title="Behaviour">
        <dl className="flex flex-col gap-2.5">
          <LibraryEntryRow label="Timeout">
            {view.timeout ?? "Default"}
          </LibraryEntryRow>
          <LibraryEntryRow label="Cache">
            {view.cache === null ? "Not cached" : `Reused for ${view.cache}`}
          </LibraryEntryRow>
          {view.flags.length === 0 ? null : (
            <LibraryEntryRow label="Flags">
              {view.flags.join(", ")}
            </LibraryEntryRow>
          )}
          <LibraryEntryRow label="Privacy">{view.privacy}</LibraryEntryRow>
        </dl>
      </LibraryEntrySection>

      <LibraryEntrySection title="Included in">
        {view.playbooks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {hasPlaybooks ? "No Playbook runs it." : "Playbooks did not load."}
          </p>
        ) : (
          <dl className="flex flex-col gap-2.5">
            {view.playbooks.map((playbook) => (
              <LibraryEntryRow key={playbook.id} label="Playbook">
                <Link
                  to="/library/playbooks/$playbookId"
                  params={{ playbookId: playbook.id }}
                  className={LINK_CLASS}
                >
                  {playbook.title}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {playbook.stepCount}{" "}
                  {playbook.stepCount === 1 ? "step" : "steps"}
                </span>
              </LibraryEntryRow>
            ))}
          </dl>
        )}
      </LibraryEntrySection>
    </LibraryEntryLayout>
  );
}
