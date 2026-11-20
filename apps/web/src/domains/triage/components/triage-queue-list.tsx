import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { opLabel, proposalTitle } from "@/domains/triage/lib/filters";
import {
  groupQueueByRun,
  type QueueEntry,
} from "@/domains/triage/lib/queue-run-groups";
import { cn } from "@/lib/utils";
import type { ListDensity } from "@/shared/lib/list/list-display-store";
import { groupItemsByDay } from "@/shared/ui/group-by-day";
import { QueueDayGroup } from "@/shared/ui/queue-day-group";
import { QueueRow } from "@/shared/ui/queue-row";
import { QueueRowInstantMeta } from "@/shared/ui/queue-row-instant-meta";
import { QueueRowTitle } from "@/shared/ui/queue-row-title";
import { StatusDot } from "@/shared/ui/status-dot";
import { playbookLabel } from "@/shared/ui/vocab";
import type { ProposalQueueItem } from "@watchdog/core/proposals";

type TriageQueueListProps = {
  proposals: readonly ProposalQueueItem[];
  selectedId: string | null;
  /** The list's Display options density (`useListDisplay`). */
  density?: ListDensity;
  onSelect: (id: string) => void;
};

type RowProps = {
  proposal: ProposalQueueItem;
  selectedId: string | null;
  density: ListDensity;
  onSelect: (id: string) => void;
};

function ProposalRow({ proposal, selectedId, density, onSelect }: RowProps) {
  const isSelected = selectedId === proposal.id;
  return (
    <li>
      <QueueRow
        role="option"
        aria-selected={isSelected}
        isSelected={isSelected}
        onClick={() => {
          onSelect(proposal.id);
        }}
        className={density === "compact" ? "py-0.5" : "py-2"}
        trailing={<StatusDot status={proposal.status} />}
      >
        <QueueRowTitle className="font-sans">
          {proposalTitle(proposal)}
        </QueueRowTitle>
        <span className="text-muted-foreground truncate text-xs">
          {opLabel(proposal.opCounts)}
          {proposal.evidenceCount > 0 ? ` · ${proposal.evidenceCount} ev` : ""}
        </span>
        <QueueRowInstantMeta value={proposal.createdAt} id={proposal.id} />
      </QueueRow>
    </li>
  );
}

type RunEntry = Extract<QueueEntry, { kind: "run" }>;

function proposalsLabel(count: number): string {
  return count === 1 ? "1 Proposal" : `${count} Proposals`;
}

function runHoldsSelection(
  entry: RunEntry,
  selectedId: string | null
): boolean {
  return entry.proposals.some((p) => p.id === selectedId);
}

/**
 * One Playbook run's Proposals under one row: the run's counts come from the server (every status
 * and page), the rows under it are the ones this view loaded. It starts open when it holds the
 * selection; the parent keys it on that, so selecting a member (by key or URL) opens it. A queue
 * row, not a Collapsible, so the route loads no disclosure primitive for it.
 */
function RunGroup({
  entry,
  selectedId,
  density,
  onSelect,
}: Omit<RowProps, "proposal"> & { entry: RunEntry }) {
  const { run } = entry;
  const [isOpen, setIsOpen] = useState(() =>
    runHoldsSelection(entry, selectedId)
  );
  const label = `${playbookLabel(entry.playbookId)} run`;
  const notShown = run.proposalCount - entry.proposals.length;
  const membersId = `run-${run.id}`;
  return (
    <li>
      <QueueRow
        role="button"
        aria-selected={undefined}
        aria-expanded={isOpen}
        aria-controls={membersId}
        aria-label={`${label}: ${proposalsLabel(run.proposalCount)}, ${run.pendingCount} pending`}
        onClick={() => {
          setIsOpen((open) => !open);
        }}
        className={density === "compact" ? "py-0.5" : "py-2"}
        leading={
          <ChevronRightIcon
            className={cn(
              "text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform",
              isOpen && "rotate-90"
            )}
            aria-hidden
          />
        }
        trailing={
          run.pendingCount > 0 ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {run.pendingCount} pending
            </span>
          ) : null
        }
      >
        <QueueRowTitle className="font-sans">{label}</QueueRowTitle>
        <span className="text-muted-foreground text-xs tabular-nums">
          {proposalsLabel(run.proposalCount)}
        </span>
      </QueueRow>
      {isOpen ? (
        <ul
          id={membersId}
          className="divide-border border-border divide-y border-t pl-4"
          aria-label={label}
        >
          {entry.proposals.map((proposal) => (
            <ProposalRow
              key={proposal.id}
              proposal={proposal}
              selectedId={selectedId}
              density={density}
              onSelect={onSelect}
            />
          ))}
          {notShown > 0 ? (
            <li className="text-muted-foreground px-3 py-2 text-xs">
              {notShown} more from this run not in this view (another status, or
              not loaded yet)
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function entryCreatedAt(entry: QueueEntry): string {
  return entry.kind === "run"
    ? (entry.proposals[0]?.createdAt ?? "")
    : entry.proposal.createdAt;
}

function entryProposalCount(entry: QueueEntry): number {
  return entry.kind === "run" ? entry.proposals.length : 1;
}

/**
 * The Triage queue by day, with a Playbook run's Proposals folded into one row under the day of
 * its newest loaded Proposal.
 */
export function TriageQueueList({
  proposals,
  selectedId,
  density = "comfortable",
  onSelect,
}: TriageQueueListProps) {
  const days = groupItemsByDay(groupQueueByRun(proposals), entryCreatedAt);

  return (
    <div role="listbox" aria-label="Proposals">
      {days.map((day) => (
        <QueueDayGroup
          key={day.key}
          label={day.label}
          count={day.items.reduce((n, e) => n + entryProposalCount(e), 0)}
        >
          {day.items.map((entry) =>
            entry.kind === "run" ? (
              <RunGroup
                // Remounts when the selection moves in or out: a run opens on its member.
                key={`${entry.run.id}:${runHoldsSelection(entry, selectedId) ? "in" : "out"}`}
                entry={entry}
                selectedId={selectedId}
                density={density}
                onSelect={onSelect}
              />
            ) : (
              <ProposalRow
                key={entry.proposal.id}
                proposal={entry.proposal}
                selectedId={selectedId}
                density={density}
                onSelect={onSelect}
              />
            )
          )}
        </QueueDayGroup>
      ))}
    </div>
  );
}
