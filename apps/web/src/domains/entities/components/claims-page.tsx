import { useQuery } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useMemo } from "react";

import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import type { CaseRecord } from "@/domains/cases/types";
import {
  claimConfidenceCountsQuery,
  claimListView,
} from "@/domains/entities/claims/queries";
import type { ClaimRecord } from "@/domains/entities/claims/types";
import { useEntityRefSource } from "@/domains/entities/hooks/use-entity-ref-source";
import { entityPickerPort } from "@/domains/entities/queries";
import { cn } from "@/lib/utils";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { useRecordsByIds } from "@/shared/hooks/use-picker-source";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { Chip } from "@/shared/ui/chip";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { EntityMention } from "@/shared/ui/entity-mention";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { ListBody, ListCount, ListToolbar } from "@/shared/ui/list";
import {
  ClaimClassBadge,
  ConfidenceBadge,
  EntityKindGlyph,
  StatusBadge,
} from "@/shared/ui/vocab";
import type {
  ClaimConfidenceCounts,
  claimList,
} from "@watchdog/domain/schemas/graph";
import {
  CONFIDENCE_TIER_LABELS,
  LIST_TOTAL_CAP,
  type ListQuery,
  type ListSearch,
  type UnfixedSearchPatch,
} from "@watchdog/domain/schemas/shared";

export type ClaimsPageSearch = {
  readonly search: ListSearch<typeof claimList>;
  readonly onSearchChange: (
    patch: UnfixedSearchPatch<typeof claimList, never>
  ) => void;
};

/** The tier cards, strongest first; `uncited` is the Claims that cite no Evidence. */
const CLAIM_TIER_CARDS = [
  "all",
  "confirmed",
  "possible",
  "unverified",
  "uncited",
] as const;
type ClaimTierCard = (typeof CLAIM_TIER_CARDS)[number];

/** The card whose filter is exactly the view's tier filters, or `null` for any other mix. */
function cardOf(query: ListQuery<typeof claimList>): ClaimTierCard | null {
  const { uncited, confidence } = query.filters;
  if (uncited) return confidence.length === 0 ? "uncited" : null;
  if (confidence.length === 0) return "all";
  return confidence.length === 1 && confidence[0] !== undefined
    ? confidence[0]
    : null;
}

function patchOf(
  card: ClaimTierCard
): UnfixedSearchPatch<typeof claimList, never> {
  if (card === "uncited") return { uncited: true, confidence: undefined };
  if (card === "all") return { uncited: undefined, confidence: undefined };
  return { uncited: undefined, confidence: [card] };
}

function cardLabel(card: ClaimTierCard): string {
  if (card === "all") return "All";
  if (card === "uncited") return "No Evidence";
  return CONFIDENCE_TIER_LABELS[card];
}

/** A card's count: "…" while the counts load, "—" if they failed, "1,000+" past the cap. */
function countText(
  card: ClaimTierCard,
  counts: ClaimConfidenceCounts | undefined,
  isError: boolean
): string {
  if (counts === undefined) return isError ? "—" : "…";
  const n = counts[card];
  return n > LIST_TOTAL_CAP
    ? `${LIST_TOTAL_CAP.toLocaleString()}+`
    : n.toLocaleString();
}

type TierCardsProps = {
  selected: ClaimTierCard | null;
  counts: ClaimConfidenceCounts | undefined;
  isError: boolean;
  onPick: (card: ClaimTierCard) => void;
};

/** One card per tier, each a filter. The counts come from the server, whatever page is loaded. */
function TierCards({ selected, counts, isError, onPick }: TierCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {CLAIM_TIER_CARDS.map((card) => (
        <button
          key={card}
          type="button"
          aria-pressed={card === selected}
          onClick={() => {
            onPick(card);
          }}
          className={cn(
            "flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
            card === selected
              ? "border-foreground/40"
              : "border-border hover:border-foreground/20"
          )}
        >
          <span className="text-muted-foreground text-xs">
            {cardLabel(card)}
          </span>
          <span
            className={cn(
              "text-2xl font-semibold tabular-nums",
              card === "uncited" && "text-warning"
            )}
          >
            {countText(card, counts, isError)}
          </span>
        </button>
      ))}
    </div>
  );
}

type ClaimRowProps = {
  row: ClaimRecord;
  entity: EntityOption | undefined;
};

function ClaimRow({ row, entity }: ClaimRowProps) {
  const evidenceCount = row.evidenceIds.length;
  return (
    <li className="border-border flex items-start gap-3 border-b py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug break-words whitespace-pre-wrap",
            row.retracted && "text-muted-foreground line-through"
          )}
        >
          {row.text}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm leading-tight">
          <ConfidenceBadge confidence={row.confidence} />
          {entity === undefined ? null : (
            <Chip className="max-w-64">
              {entity.kind === undefined ? null : (
                <EntityKindGlyph kind={entity.kind} />
              )}
              <EntityMention
                name={entity.name}
                slug={entity.slug}
                tab="claims"
                size="sm"
                className="min-w-0"
                nameClassName="text-2xs"
              />
            </Chip>
          )}
          <ClaimClassBadge claimClass={row.class} />
          {row.retracted ? (
            <StatusBadge status={row.retractKind ?? "retracted"} />
          ) : null}
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs tabular-nums">
            {evidenceCount === 0 ? (
              <CircleAlertIcon
                aria-hidden
                className="text-warning size-3.5 shrink-0"
              />
            ) : null}
            {evidenceCount === 0 ? "No Evidence" : `${evidenceCount} Evidence`}
          </span>
        </div>
      </div>
    </li>
  );
}

type ClaimsActiveProps = ClaimsPageSearch & { active: CaseRecord };

function ClaimsActive({ active, search, onSearchChange }: ClaimsActiveProps) {
  const list = useList(claimListView, {
    scope: { caseId: active.id },
    search,
    onSearchChange,
  });
  const display = useListDisplay("claims");
  const counts = useQuery(claimConfidenceCountsQuery(active.id, list.query));
  const entitySource = useEntityRefSource(
    active.id,
    list.query.filters.entityId
  );
  const entityPort = useMemo(() => entityPickerPort(active.id), [active.id]);
  // Names of the Entities the loaded Claims are about: a by-ids read of exactly those ids.
  const entities = useRecordsByIds(
    entityPort,
    list.rows.map((row) => row.entityId)
  );

  return (
    <Page>
      <PageHeader
        count={
          <ListCount
            count={list.count}
            noun={list.def.noun}
            variant="compact"
            isLive={false}
          />
        }
        countOn="claims"
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 pt-3">
        <TierCards
          selected={cardOf(list.query)}
          counts={counts.data}
          isError={counts.isError}
          onPick={(card) => {
            onSearchChange(patchOf(card));
          }}
        />
        <FetchErrorAlert
          error={counts.isError ? "Couldn't load the Claim counts." : null}
          onRetry={() => {
            void counts.refetch();
          }}
        />
        <ListToolbar
          list={list}
          display={display}
          sources={{ entityId: entitySource }}
        />
        <ListBody list={list} skeleton={null}>
          {(rows) => (
            <ul className="flex flex-col">
              {rows.map((row) => (
                <ClaimRow
                  key={row.id}
                  row={row}
                  entity={entities.get(row.entityId)}
                />
              ))}
            </ul>
          )}
        </ListBody>
      </div>
    </Page>
  );
}

/**
 * Every Claim in the Case (`claimList`, ADR-0007), the screen a Case's conclusions read from:
 * each row names its Entity and how much Evidence it cites, and the tier cards count on the
 * server. Its route owns the view (`claimList.searchWith`, `usePatchSearch`).
 */
export function ClaimsPage({ search, onSearchChange }: ClaimsPageSearch) {
  const active = useLiveWorkCase();
  return (
    <ClaimsActive
      active={active}
      search={search}
      onSearchChange={onSearchChange}
    />
  );
}
