import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, CopyIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { groupFoundValues } from "@/domains/jobs/lib/found-value-groups";
import { jobFoundValuesQuery } from "@/domains/jobs/queries";
import { copyText } from "@/shared/hooks/use-copy-text";
import { Chip } from "@/shared/ui/chip";
import { CollapsibleRowTrigger } from "@/shared/ui/collapsible-row-trigger";
import { EmptyState } from "@/shared/ui/empty-state";
import { EntityMention } from "@/shared/ui/entity-mention";
import { Button } from "@/shared/ui/primitives/button";
import type { FoundValueRecord } from "@watchdog/domain/schemas/jobs";
import {
  Collapsible,
  CollapsibleContent,
} from "@watchdog/ui/components/collapsible";
import { Input } from "@watchdog/ui/components/input";

/** A type group at or under this size starts open. */
const GROUP_OPEN_MAX = 12;

type FoundValueRowProps = {
  row: FoundValueRecord;
  onAdd?: (row: FoundValueRecord) => void;
};

function FoundValueRow({ row, onAdd }: FoundValueRowProps) {
  return (
    <div className="border-border flex items-start gap-2 border-t px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-foreground font-mono text-xs break-all">
          {row.value}
        </p>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <span>{row.sources.join(" · ")}</span>
          {row.onEntities.map((entity) => (
            <Chip key={entity.id} size="sm">
              On{" "}
              <EntityMention name={entity.name} slug={entity.slug} size="sm" />
            </Chip>
          ))}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Copy ${row.value}`}
        onClick={() => {
          void copyText(row.value, {
            success: "Copied",
            failure: "Couldn't copy",
          });
        }}
      >
        <CopyIcon aria-hidden />
      </Button>
      {onAdd === undefined ? null : (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Add ${row.value} to an Entity`}
          onClick={() => {
            onAdd(row);
          }}
        >
          <PlusIcon aria-hidden />
        </Button>
      )}
    </div>
  );
}

type FoundValuesSectionProps = {
  caseId: string;
  jobId: string;
  isLive: boolean;
  /** Offer "Add to Entity" on each value; the screen that composes Job detail owns the dialog. */
  onAdd?: (row: FoundValueRecord) => void;
};

/**
 * The Found tab: every typed value the Job's report holds (its Cap's `found` reader), grouped by
 * type, with where each came from and which Entities already hold it. A value is added to an
 * Entity by hand (`onAdd`); nothing here is a Proposal.
 */
export function FoundValuesSection({
  caseId,
  jobId,
  isLive,
  onAdd,
}: FoundValuesSectionProps) {
  const query = useQuery(jobFoundValuesQuery(caseId, jobId));
  const [q, setQ] = useState("");

  if (query.data === undefined) {
    return query.isError ? (
      <EmptyState
        intent="blank-slate"
        items="values"
        size="sm"
        title="Couldn't load found values"
      />
    ) : null;
  }
  const found = query.data;
  if (!found.hasReader) {
    return (
      <EmptyState
        intent="blank-slate"
        items="values"
        size="sm"
        title={isLive ? "Not finished yet" : "No found values"}
        description={
          isLive
            ? "Found values appear when the Job finishes."
            : "This Cap doesn't list what it found yet. Its full report is under Output."
        }
      />
    );
  }

  const groups = groupFoundValues(found.values, q);
  return (
    <section className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        Everything this Job&apos;s report holds, not only what its Proposal
        carries.{" "}
        {found.isTruncated
          ? `Showing ${found.values.length} of ${found.total}.`
          : `${found.total} value${found.total === 1 ? "" : "s"}.`}
      </p>
      <Input
        value={q}
        onChange={(event) => {
          setQ(event.target.value);
        }}
        placeholder="Filter values…"
        aria-label="Filter found values"
      />
      {groups.length === 0 ? (
        <EmptyState
          intent="no-results"
          items="values"
          query={q}
          size="sm"
          onClearFilters={() => {
            setQ("");
          }}
        />
      ) : (
        <div className="border-border overflow-hidden rounded-md border">
          {groups.map((group) => (
            <div
              key={group.type}
              className="border-border border-b last:border-b-0"
            >
              <Collapsible defaultOpen={group.values.length <= GROUP_OPEN_MAX}>
                <CollapsibleRowTrigger
                  aria-label={`${group.label} (${group.values.length})`}
                >
                  <ChevronDownIcon
                    className="text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform group-aria-expanded/row-trigger:rotate-180"
                    aria-hidden
                  />
                  <span className="text-foreground text-xs">{group.label}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {group.values.length}
                  </span>
                  {group.heldCount > 0 ? (
                    <Chip size="sm">{group.heldCount} already on Entities</Chip>
                  ) : null}
                </CollapsibleRowTrigger>
                <CollapsibleContent>
                  {group.values.map((row) => (
                    <FoundValueRow
                      key={`${row.type}:${row.platform}:${row.value}`}
                      row={row}
                      onAdd={onAdd}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
