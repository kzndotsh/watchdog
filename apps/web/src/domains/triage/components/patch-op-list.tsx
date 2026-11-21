import { Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";

import { evidenceIdsForOp, evidenceLabel } from "@/domains/triage/lib/evidence";
import {
  groupPatchOps,
  type PatchOpGroup,
} from "@/domains/triage/lib/patch-op-groups";
import { summarizePatchOpData } from "@/domains/triage/lib/patch-op-summary";
import { cn } from "@/lib/utils";
import { useWorkCase } from "@/shared/hooks/use-route-case";
import { Chip } from "@/shared/ui/chip";
import { CollapsibleRowTrigger } from "@/shared/ui/collapsible-row-trigger";
import { IdChip } from "@/shared/ui/id-chip";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { Button } from "@/shared/ui/primitives/button";
import { SectionHeaderBar } from "@/shared/ui/section-header-bar";
import { PATCH_RESOURCE_META, PatchOpBadge } from "@/shared/ui/vocab";
import {
  patchOpResource,
  patchOpVerb,
  type PatchOp,
} from "@watchdog/domain/schemas/graph";
import { Checkbox } from "@watchdog/ui/components/checkbox";
import {
  Collapsible,
  CollapsibleContent,
} from "@watchdog/ui/components/collapsible";

const EMPTY_IDS: string[] = [];

/**
 * Evidence shared by the whole patch (proposal shared ids, or the intersection
 * of every op that cites anything). Used to de-dupe per-op chips.
 */
function sharedPatchEvidenceIds(
  patch: PatchOp[],
  sharedEvidenceIds: string[]
): string[] {
  if (sharedEvidenceIds.length > 0) return sharedEvidenceIds;

  const perOp = patch.flatMap((op) => {
    const ids = evidenceIdsForOp(op, EMPTY_IDS);
    return ids.length > 0 ? [ids] : [];
  });
  if (perOp.length === 0) return EMPTY_IDS;
  if (perOp.length === 1) return perOp[0] ?? EMPTY_IDS;

  const first = perOp[0] ?? EMPTY_IDS;
  return first.filter((id) => perOp.every((ids) => ids.includes(id)));
}

type EvidenceChipsProps = {
  ids: string[];
  evidenceById?: ReadonlyMap<string, EvidenceOption>;
  onEvidenceClick?: (evidenceId: string) => void;
};

function EvidenceChips({
  ids,
  evidenceById,
  onEvidenceClick,
}: EvidenceChipsProps) {
  if (ids.length === 0) return null;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {ids.map((id) => {
        const row = evidenceById?.get(id);
        if (!row) {
          return <IdChip key={id} value={id} className="opacity-70" />;
        }
        const label = evidenceLabel(row);
        const chip = (
          <Chip size="sm" className="max-w-[14rem] truncate" title={label}>
            {label}
          </Chip>
        );
        if (!onEvidenceClick) return <span key={id}>{chip}</span>;
        return (
          <button
            key={id}
            type="button"
            className="max-w-full"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEvidenceClick(id);
            }}
          >
            {chip}
          </button>
        );
      })}
    </span>
  );
}

/**
 * Which ops a pending Proposal's Accept applies (tick boxes), or how a decided partial Accept
 * left the rest (chips). Absent: a plain ledger.
 */
export type PatchOpChoice =
  | {
      kind: "choosing";
      skipped: ReadonlySet<string>;
      onToggle: (opId: string) => void;
      onSetGroup: (opIds: readonly string[], isTicked: boolean) => void;
    }
  | {
      kind: "decided";
      left: ReadonlySet<string>;
      rejected: ReadonlySet<string>;
    };

type PatchOpRowProps = {
  op: PatchOp;
  localIds: string[];
  evidenceById?: ReadonlyMap<string, EvidenceOption>;
  onEvidenceClick?: (evidenceId: string) => void;
  isColliding?: boolean;
  isInvalid?: boolean;
  choice?: PatchOpChoice;
};

function PatchOpRow({
  op,
  localIds,
  evidenceById,
  onEvidenceClick,
  isColliding,
  isInvalid,
  choice,
}: PatchOpRowProps) {
  const resource = patchOpResource(op);
  const meta = PATCH_RESOURCE_META[resource];
  const summary = summarizePatchOpData(resource, op.data);
  const isSkipped = choice?.kind === "choosing" && choice.skipped.has(op.id);

  return (
    <div
      className={cn(
        "border-border flex flex-col gap-1.5 border-b px-2.5 py-2 last:border-b-0",
        isSkipped && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {choice?.kind === "choosing" ? (
          <Checkbox
            className="size-3.5 shrink-0"
            aria-label={`Accept: ${meta.label} ${summary}`}
            checked={!isSkipped}
            onCheckedChange={() => {
              choice.onToggle(op.id);
            }}
          />
        ) : null}
        <PatchOpBadge op={patchOpVerb(op)} />
        <span className="text-foreground text-xs">{meta.label}</span>
        {isColliding ? <Chip size="sm">On another Entity</Chip> : null}
        {isInvalid ? <Chip size="sm">Invalid value</Chip> : null}
        {choice?.kind === "decided" && choice.left.has(op.id) ? (
          <Chip size="sm">Left</Chip>
        ) : null}
        {choice?.kind === "decided" && choice.rejected.has(op.id) ? (
          <Chip size="sm">Rejected</Chip>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs leading-snug break-words whitespace-pre-wrap">
        {summary}
      </p>
      {localIds.length > 0 ? (
        <EvidenceChips
          ids={localIds}
          evidenceById={evidenceById}
          onEvidenceClick={onEvidenceClick}
        />
      ) : null}
    </div>
  );
}

function PatchOpGroupTrigger({
  group,
  tickedCount,
}: {
  group: PatchOpGroup;
  /** While choosing: how many of the group's ops are ticked. */
  tickedCount?: number;
}) {
  const count =
    tickedCount === undefined || tickedCount === group.ops.length
      ? `${group.ops.length}`
      : `${tickedCount} of ${group.ops.length}`;
  return (
    <CollapsibleRowTrigger aria-label={`${group.label} (${count})`}>
      <ChevronDownIcon
        className="text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform group-aria-expanded/row-trigger:rotate-180"
        aria-hidden
      />
      <span className="text-foreground text-xs">{group.label}</span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {count}
      </span>
      {group.flaggedCount > 0 ? (
        <Chip size="sm">{group.flaggedCount} flagged</Chip>
      ) : null}
    </CollapsibleRowTrigger>
  );
}

function groupTickedCount(
  group: PatchOpGroup,
  skipped: ReadonlySet<string>
): number {
  return group.ops.filter((op) => !skipped.has(op.id)).length;
}

type PatchOpGroupSectionProps = {
  group: PatchOpGroup;
  sharedEvidenceIds: string[];
  bundleSet: ReadonlySet<string>;
  collidingSet: ReadonlySet<string>;
  invalidSet: ReadonlySet<string>;
  evidenceById?: ReadonlyMap<string, EvidenceOption>;
  onEvidenceClick?: (evidenceId: string) => void;
  choice?: PatchOpChoice;
};

function PatchOpGroupSection({
  group,
  sharedEvidenceIds,
  bundleSet,
  collidingSet,
  invalidSet,
  evidenceById,
  onEvidenceClick,
  choice,
}: PatchOpGroupSectionProps) {
  return (
    <div className="border-border border-b last:border-b-0">
      <Collapsible defaultOpen={group.isOpenByDefault}>
        {choice?.kind === "choosing" ? (
          <div className="flex items-start gap-2 pl-3">
            {/* Ticked only when every op is; a partly ticked group says "2 of 4" beside it. */}
            <Checkbox
              className="mt-3 size-3.5 shrink-0"
              aria-label={`Accept all ${group.label}`}
              checked={
                groupTickedCount(group, choice.skipped) === group.ops.length
              }
              onCheckedChange={(next) => {
                choice.onSetGroup(
                  group.ops.map((op) => op.id),
                  next
                );
              }}
            />
            <div className="min-w-0 flex-1">
              <PatchOpGroupTrigger
                group={group}
                tickedCount={groupTickedCount(group, choice.skipped)}
              />
            </div>
          </div>
        ) : (
          <PatchOpGroupTrigger group={group} />
        )}
        <CollapsibleContent>
          <div className="border-border border-t">
            {group.ops.map((op) => {
              const allIds = evidenceIdsForOp(op, sharedEvidenceIds);
              const localIds = allIds.filter((id) => !bundleSet.has(id));
              return (
                <PatchOpRow
                  key={op.id}
                  op={op}
                  localIds={localIds}
                  evidenceById={evidenceById}
                  onEvidenceClick={onEvidenceClick}
                  isColliding={collidingSet.has(op.id)}
                  isInvalid={invalidSet.has(op.id)}
                  choice={choice}
                />
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

type PatchOpListProps = {
  patch: PatchOp[];
  sharedEvidenceIds?: string[];
  evidenceById?: ReadonlyMap<string, EvidenceOption>;
  onEvidenceClick?: (evidenceId: string) => void;
  jobId?: string | null;
  collidingOpIds?: string[];
  invalidOpIds?: string[];
  /** Tick boxes for a pending Proposal, or the left / rejected chips of a decided one. */
  choice?: PatchOpChoice;
};

/**
 * Patch ledger: the Changes section, grouped by resource and Identifier type (a big group starts
 * collapsed behind its count, flagged ops first), with an optional Collect link for the Job.
 */
export function PatchOpList({
  patch,
  sharedEvidenceIds = EMPTY_IDS,
  evidenceById,
  onEvidenceClick,
  jobId,
  collidingOpIds = EMPTY_IDS,
  invalidOpIds = EMPTY_IDS,
  choice,
}: PatchOpListProps) {
  const { slug: caseSlug } = useWorkCase();
  if (patch.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">Empty patch (no ops).</p>
    );
  }

  const bundleIds = sharedPatchEvidenceIds(patch, sharedEvidenceIds);
  const bundleSet = new Set(bundleIds);
  const collidingSet = new Set(collidingOpIds);
  const invalidSet = new Set(invalidOpIds);
  const flaggedSet = new Set([...collidingOpIds, ...invalidOpIds]);
  const groups = groupPatchOps(patch, flaggedSet);
  const hasJob = jobId !== null && jobId !== undefined && jobId !== "";

  return (
    <section className="flex flex-col gap-2">
      <SectionHeaderBar
        title="Changes"
        count={patch.length}
        action={
          hasJob ? (
            <Button
              nativeButton={false}
              variant="link"
              size="inline"
              render={
                <Link
                  to="/cases/$caseSlug/collect"
                  params={{ caseSlug }}
                  search={{ id: jobId }}
                />
              }
            >
              Open in Collect
            </Button>
          ) : undefined
        }
      />

      <div className="border-border overflow-hidden rounded-md border">
        {groups.map((group) => (
          <PatchOpGroupSection
            // The open state starts from `isOpenByDefault`; keying on whether the group holds a
            // flagged op remounts it when a flag arrives (or clears), so a newly flagged group
            // opens. Toggles are kept while the flagged state stays the same.
            key={`${group.key}:${group.flaggedCount > 0 ? "flagged" : "clear"}`}
            group={group}
            sharedEvidenceIds={sharedEvidenceIds}
            bundleSet={bundleSet}
            collidingSet={collidingSet}
            invalidSet={invalidSet}
            evidenceById={evidenceById}
            onEvidenceClick={onEvidenceClick}
            choice={choice}
          />
        ))}
      </div>
    </section>
  );
}
