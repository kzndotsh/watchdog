import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useCapDetail } from "@/domains/library/hooks/use-cap-detail";
import {
  COMMERCIAL_USE_LABELS,
  PROVIDER_TIER_LABELS,
  type CapKindChip,
} from "@/domains/library/lib/cap-detail";
import type { LibraryEntry } from "@/domains/library/types";
import { Chip } from "@/shared/ui/chip";
import { ExternalUrl } from "@/shared/ui/external-url";
import { MetaGrid } from "@/shared/ui/meta-grid";
import { MetaGridItem } from "@/shared/ui/meta-grid-item";
import { SectionLabel } from "@/shared/ui/section-label";

export type LibraryCapDetailProps = {
  entry: Pick<LibraryEntry, "id">;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

function KindChips({ chips }: { chips: readonly CapKindChip[] }) {
  if (chips.length === 0) {
    return <span className="text-muted-foreground text-sm">Nothing</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li key={chip.kind}>
          {chip.isLinked ? (
            <Link to="/library" search={{ kind: chip.kind, id: undefined }}>
              <Chip size="md">{chip.label}</Chip>
            </Link>
          ) : (
            <Chip size="md">{chip.label}</Chip>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * A Cap's Library page: what it takes and makes, who provides the data, how it behaves,
 * the keys it reads and the Playbooks that run it. Every line comes from the Cap's
 * descriptor, never from copy written for one Cap.
 */
export function LibraryCapDetail({ entry }: LibraryCapDetailProps) {
  const detail = useCapDetail(entry.id);
  if (detail === null) return null;
  const { cap, view } = detail;
  const { provider } = cap;

  return (
    <div className="flex flex-col gap-5">
      <Section title="Takes">
        <KindChips chips={view.consumes} />
      </Section>
      <Section title="Produces">
        <KindChips chips={view.produces} />
      </Section>

      <Section title="Provider">
        <div className="border-border flex flex-col gap-2 rounded-md border p-3">
          <a
            href={provider.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm font-medium hover:underline"
          >
            {provider.name}
          </a>
          <MetaGrid>
            <MetaGridItem label="Plan">
              {PROVIDER_TIER_LABELS[provider.tier]}
            </MetaGridItem>
            <MetaGridItem label="Commercial use">
              {COMMERCIAL_USE_LABELS[provider.commercialUse]}
            </MetaGridItem>
            <MetaGridItem label="Terms">
              <ExternalUrl href={provider.termsUrl} />
            </MetaGridItem>
            {provider.attribution === undefined ? null : (
              <MetaGridItem label="Credit">
                <a
                  href={provider.attribution.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {provider.attribution.text}
                </a>
              </MetaGridItem>
            )}
          </MetaGrid>
        </div>
      </Section>

      <Section title="Behaviour">
        <MetaGrid>
          <MetaGridItem label="Timeout">
            {view.timeout ?? "Default"}
          </MetaGridItem>
          <MetaGridItem label="Cache">
            {view.cache === null ? "Not cached" : `Reused for ${view.cache}`}
          </MetaGridItem>
          {view.flags.length === 0 ? null : (
            <MetaGridItem label="Flags">
              <span className="flex flex-wrap gap-1.5">
                {view.flags.map((flag) => (
                  <Chip key={flag} size="md">
                    {flag}
                  </Chip>
                ))}
              </span>
            </MetaGridItem>
          )}
        </MetaGrid>
        <p className="text-sm">{view.privacy}</p>
      </Section>

      <Section title="Keys it reads">
        {view.credentials.length === 0 ? (
          <p className="text-muted-foreground text-sm">None.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1 text-sm">
              {view.credentials.map((line) => (
                <li key={line.slots.join("|")}>
                  <span className="font-mono">{line.slots.join(" | ")}</span>
                  {line.slots.length > 1 ? " (any one)" : null}
                  {line.isOptional ? " (optional)" : null}
                </li>
              ))}
            </ul>
            <Link
              to="/settings"
              search={{ tab: "credentials" }}
              className="text-primary text-sm hover:underline"
            >
              Manage keys in Settings
            </Link>
          </>
        )}
      </Section>

      <Section title="In Playbooks">
        {view.playbooks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No Playbook runs it.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {view.playbooks.map((playbook) => (
              <li key={playbook.id}>
                <a
                  href={`/library/playbooks/${encodeURIComponent(playbook.id)}`}
                  className="text-primary hover:underline"
                >
                  {playbook.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
