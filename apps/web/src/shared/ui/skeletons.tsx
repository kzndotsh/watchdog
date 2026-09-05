/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- skeleton layout tokens + components */
import { GripVerticalIcon } from "lucide-react";
/**
 * Skeleton loading states for each major surface.
 *
 * Each component mirrors the layout of the real content so the
 * transition is smooth and there's no layout shift.
 *
 * **Tables:** production loading uses `DataTable` `pending` + per-cell
 * skeleton rows (colgroup-aligned) — never wrap table bodies in `PendingRegion`.
 * See [`docs/reference/web/ui/loading.md`](../../../../docs/reference/web/ui/loading.md).
 *
 * **Naming:** `*Skeleton` — PendingRegion fallback / exported loading UI.
 * `*SkeletonLayout` — inner layout blocks composed by `*Skeleton` (or wrapped
 * in `LoadingRegion` directly, e.g. dossier tab pending).
 * **LoadingRegion:** owned by `PendingRegion` / route shells.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  CASE_CARD_MIN_HEIGHT_CLASS,
  CASE_CARD_SHELL_CLASS,
} from "@/shared/ui/case-card-shell";
import { CHIP_SIZE_CLASS } from "@/shared/ui/detail-status-chip";
import { EvidenceDetailSkeleton } from "@/shared/ui/evidence-detail-skeleton";
import {
  GRAPH_CANVAS_CONNECTIONS_SHELL_CLASS,
  GRAPH_CANVAS_EMBED_SHELL_CLASS,
  GraphCanvasLoadingRegion,
} from "@/shared/ui/graph/graph-canvas-skeleton";
import { QueueDayGroup } from "@/shared/ui/queue-day-group";
import { QueueRowMeta, QueueRowTitle } from "@/shared/ui/queue-row";
import { SectionLabel } from "@/shared/ui/section-label";
import { Skeleton } from "@/shared/ui/shadcn/skeleton";
import {
  TASK_BOARD_COLUMN_SHELL_CLASS,
  TASK_CARD_SHELL_CLASS,
} from "@/shared/ui/task-board-shell";
import { TASK_STATUSES } from "@watchdog/schemas";

export {
  TASK_BOARD_COLUMN_SHELL_CLASS,
  TASK_CARD_SHELL_CLASS,
} from "@/shared/ui/task-board-shell";
export { LoadingRegion } from "@/shared/ui/loading-region";

/** Median visible rows for entity/identifier tables. */
export const TABLE_BODY_SKELETON_ROW_COUNT = 8;

/** Kanban columns — matches TASK_STATUSES length in task-board. */
export const BOARD_SKELETON_COLUMN_COUNT = TASK_STATUSES.length;

/** Median cards per task column — shared with task-board-column. */
export const BOARD_SKELETON_CARDS_PER_COLUMN = 3;

/** Default case grid slot count (1 page of cards). */
export const CARD_GRID_SKELETON_SLOT_COUNT = 6;

/** Median visible Collect queue rows — shared with collect.tsx. */
export const COLLECT_QUEUE_SKELETON_ROW_COUNT = 10;

function splitCollectQueueRowsByDay(rows: number): number[] {
  if (rows <= 4) return [rows];
  const first = Math.ceil(rows * 0.6);
  return [first, rows - first];
}

/** One Collect queue row — uses QueueRow title/meta chrome from collect-queue-list. */
function CollectQueueRowSkeleton({
  showRecipeChip = false,
  showHint = true,
}: {
  showRecipeChip?: boolean;
  showHint?: boolean;
}) {
  return (
    <div
      data-slot="collect-queue-row-skeleton"
      className="relative flex w-full min-w-0 flex-nowrap items-start gap-2 px-3 py-2 text-left"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <QueueRowTitle>
            <Skeleton className="inline-block h-3 max-w-[55%] min-w-0 basis-32 align-middle" />
          </QueueRowTitle>
          <Skeleton className={cn(CHIP_SIZE_CLASS.md, "w-14 shrink-0")} />
          {showRecipeChip ? (
            <Skeleton className={cn(CHIP_SIZE_CLASS.md, "w-9 shrink-0")} />
          ) : null}
        </div>
        {showHint ? (
          <span className="text-foreground/70 truncate text-xs">
            <Skeleton className="inline-block h-3 w-28 max-w-[70%] align-middle" />
          </span>
        ) : null}
        <QueueRowMeta>
          <Skeleton className="inline-block h-3 w-14 align-middle tabular-nums" />
          <span aria-hidden>·</span>
          <Skeleton className="inline-block h-3 w-12 align-middle" />
          <span aria-hidden>·</span>
          <Skeleton
            className={cn(CHIP_SIZE_CLASS.md, "w-[4.5rem] shrink-0 opacity-80")}
          />
        </QueueRowMeta>
      </span>
      <span className="mt-0.5 flex shrink-0 items-center self-start">
        <Skeleton className="size-2 shrink-0 rounded-full" />
      </span>
    </div>
  );
}

/** Collect queue row layout — day groups + row shape matched to CollectQueueList. */
export function CollectQueueSkeletonLayout({
  rows = COLLECT_QUEUE_SKELETON_ROW_COUNT,
  /** Wrap rows in `<li>` when the parent is a list; otherwise use `<div>`. */
  asListItem = true,
}: {
  rows?: number;
  asListItem?: boolean;
}) {
  const daySplits = splitCollectQueueRowsByDay(rows);
  let rowIndex = 0;

  return (
    <>
      {daySplits.map((dayRows, dayIndex) => (
        <QueueDayGroup
          key={dayIndex}
          headerVariant="panel"
          label={<Skeleton className="inline-block h-3 w-20 align-middle" />}
        >
          {Array.from({ length: dayRows }).map((_, itemIndex) => {
            const index = rowIndex;
            rowIndex += 1;
            const row = (
              <CollectQueueRowSkeleton
                showRecipeChip={index % 4 === 1}
                showHint={index % 3 !== 2}
              />
            );
            if (asListItem) {
              return <li key={`${dayIndex}-${itemIndex}`}>{row}</li>;
            }
            return <div key={`${dayIndex}-${itemIndex}`}>{row}</div>;
          })}
        </QueueDayGroup>
      ))}
    </>
  );
}

export function CollectQueueSkeleton({
  rows = COLLECT_QUEUE_SKELETON_ROW_COUNT,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <CollectQueueSkeletonLayout rows={rows} />
    </div>
  );
}

/** Collect detail column — composes EvidenceDetailSkeleton (PendingRegion owns LoadingRegion). */
export function CollectDetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <EvidenceDetailSkeleton className="min-h-0 flex-1" />
    </div>
  );
}

/** Inner queue-row blocks — composed by `QueueSkeleton`. */
export function QueueBodySkeletonLayout({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1 border-b px-3 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-2.5 w-36" />
            <Skeleton className="h-2 w-10" />
          </div>
          <Skeleton className="h-2 w-24" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeletonLayout({
  slots = CARD_GRID_SKELETON_SLOT_COUNT,
  className,
}: {
  slots?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid h-full min-h-full auto-rows-[minmax(9rem,1fr)] grid-cols-1 gap-3 p-px sm:grid-cols-2 xl:grid-cols-3",
        className
      )}
    >
      {Array.from({ length: slots }).map((_, i) => (
        <div
          key={i}
          className={cn(
            CASE_CARD_SHELL_CLASS,
            "animate-pulse",
            CASE_CARD_MIN_HEIGHT_CLASS
          )}
        />
      ))}
    </div>
  );
}

export function StackBodySkeletonLayout({
  sections = 3,
}: {
  sections?: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Case overview layout — mirrors CaseOverviewTab. */
export function CaseOverviewSkeletonLayout() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-hidden className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="border-border flex flex-col gap-1 rounded-md border px-3 py-2.5"
          >
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,22rem)]">
        <section className="min-w-0">
          <Skeleton className="mb-2 h-3 w-28" />
          <div className="ml-2 flex flex-col gap-3 pl-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </section>
        <section className="border-border flex flex-col gap-3 rounded-md border p-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-16 w-full" />
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="size-5 rounded-full" />
          </div>
        </section>
      </div>
    </div>
  );
}

/** Queue-row skeleton for data-slot loading (RoutePending body, queue columns). */
export function QueueSkeleton({
  rows = 8,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <QueueBodySkeletonLayout rows={rows} />
    </div>
  );
}

/** Task card layout — mirrors TaskCard / TaskCardPreview shell. */
function TaskCardSkeleton({ showFooter = true }: { showFooter?: boolean }) {
  return (
    <div className={TASK_CARD_SHELL_CLASS}>
      <span
        aria-hidden
        className="text-muted-foreground mt-0.5 shrink-0 opacity-25"
      >
        <GripVerticalIcon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <Skeleton className="h-4 min-w-0 flex-1 basis-0 rounded-sm" />
          <Skeleton className="mt-0.5 h-4 w-10 shrink-0 rounded-sm" />
        </div>
        {showFooter ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <Skeleton className={cn(CHIP_SIZE_CLASS.sm, "w-16 shrink-0")} />
            <Skeleton className="h-3 w-14 shrink-0 rounded-sm" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Task board column layout — matches task-board-column chrome + cards. */
function TaskBoardColumnSkeleton({
  cards = BOARD_SKELETON_CARDS_PER_COLUMN,
}: {
  cards?: number;
}) {
  return (
    <div className={TASK_BOARD_COLUMN_SHELL_CLASS}>
      <header className="border-border bg-background/95 sticky top-0 z-[1] flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 backdrop-blur-sm">
        <SectionLabel as="h3">
          <Skeleton className="inline-block h-3 w-20 align-middle" />
          <Skeleton className="ml-2 inline-block h-3 w-4 align-middle tabular-nums" />
        </SectionLabel>
        <Skeleton className="size-5 shrink-0 rounded-md" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {Array.from({ length: cards }).map((_, cardIndex) => (
          <TaskCardSkeleton key={cardIndex} showFooter={cardIndex % 2 === 0} />
        ))}
      </div>
    </div>
  );
}

export function BoardSkeletonLayout({
  columns = BOARD_SKELETON_COLUMN_COUNT,
  cardsPerColumn = BOARD_SKELETON_CARDS_PER_COLUMN,
}: {
  columns?: number;
  cardsPerColumn?: number;
}) {
  return (
    <div className="divide-border flex h-full min-h-0 w-full flex-1 divide-x overflow-x-auto">
      {Array.from({ length: columns }).map((_, colIndex) => (
        <TaskBoardColumnSkeleton key={colIndex} cards={cardsPerColumn} />
      ))}
    </div>
  );
}

/** Task board columns — toolbar stays mounted; shape matched to TaskBoard. */
export function BoardSkeleton({
  columns = BOARD_SKELETON_COLUMN_COUNT,
  cardsPerColumn = BOARD_SKELETON_CARDS_PER_COLUMN,
  className,
}: {
  columns?: number;
  cardsPerColumn?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      <BoardSkeletonLayout columns={columns} cardsPerColumn={cardsPerColumn} />
    </div>
  );
}

/** Case list grid slot — matches CaseSlotGhost dimensions. */
export function CardGridSkeleton({
  slots = CARD_GRID_SKELETON_SLOT_COUNT,
  className,
}: {
  slots?: number;
  className?: string;
}) {
  return <CardGridSkeletonLayout slots={slots} className={className} />;
}

/**
 * Stack / tab data-slot skeleton (Case, Dossier, Dashboard regions).
 * No “Loading…” copy — skeleton layout only.
 */
/** Generic stack tab body — dossier tabs, settings, etc. Not case overview. */
export function StackBodySkeleton({
  sections = 3,
  className,
}: {
  sections?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <StackBodySkeletonLayout sections={sections} />
    </div>
  );
}

/** Case overview — stat tile grid + activity column + settings sidebar. */
export function CaseOverviewSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <CaseOverviewSkeletonLayout />
    </div>
  );
}

/** Flex table-row blocks for dossier tab previews — not production `DataTable`. */
export function TableBodySkeletonLayout({
  rows = TABLE_BODY_SKELETON_ROW_COUNT,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="border-border flex h-10 items-start border-b px-3"
        >
          {Array.from({ length: columns }).map((__, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn(
                "h-2.5 shrink-0",
                colIndex === 0 ? "w-32" : "w-16 flex-1"
              )}
            />
          ))}
        </div>
      ))}
    </>
  );
}

export function RoutePendingSkeletonLayout() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border shrink-0 border-b px-6 py-4">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <StackBodySkeletonLayout sections={2} />
      </div>
    </div>
  );
}

/** Dossier section chrome — SectionLabel row + optional ghost action. */
function DossierSectionBlockSkeleton({
  titleWidth = "w-20",
  showAction = true,
  children,
}: {
  titleWidth?: string;
  showAction?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-6 shrink-0 items-center justify-between gap-2">
        <Skeleton className={cn("h-4", titleWidth)} />
        {showAction ? <Skeleton className="size-6 rounded-md" /> : null}
      </div>
      {children}
    </div>
  );
}

function DossierClaimRowSkeleton() {
  return (
    <div className="flex items-start gap-2">
      <Skeleton className="mt-0.5 h-3 w-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[85%]" />
        <div className="flex flex-wrap gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function DossierConnectionListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {["Outbound", "Inbound"].map((label) => (
        <div key={label} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-16" />
          <ul className="border-border divide-border divide-y rounded-md border">
            {Array.from({ length: rows }).map((_, index) => (
              <li key={`${label}-${index}`} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-14 shrink-0" />
                  <Skeleton className="h-4 min-w-0 flex-1" />
                  <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function DossierTimelineSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dossier Overview tab — Summary, Claims, Identifiers, Connections stack. */
export function DossierOverviewSkeletonLayout() {
  return (
    <div className="flex flex-col gap-6">
      <DossierSectionBlockSkeleton titleWidth="w-16" showAction={false}>
        <Skeleton className="border-border min-h-32 w-full rounded-md border" />
      </DossierSectionBlockSkeleton>
      <DossierSectionBlockSkeleton titleWidth="w-14">
        <div className="flex flex-col gap-2">
          <DossierClaimRowSkeleton />
          <DossierClaimRowSkeleton />
        </div>
      </DossierSectionBlockSkeleton>
      <DossierSectionBlockSkeleton titleWidth="w-20">
        <div className="border-border overflow-hidden rounded-md border">
          <div className="border-border bg-muted/30 flex h-8 items-center gap-2 border-b px-3">
            {["w-24", "w-14", "w-14", "w-12", "w-16"].map((width) => (
              <Skeleton key={width} className={cn("h-2.5 shrink-0", width)} />
            ))}
          </div>
          <TableBodySkeletonLayout rows={3} columns={5} />
        </div>
      </DossierSectionBlockSkeleton>
      <DossierSectionBlockSkeleton titleWidth="w-24">
        <div className="flex flex-col gap-3">
          <DossierConnectionListSkeleton rows={1} />
          <GraphCanvasLoadingRegion
            label="Loading connections graph"
            shellClassName={GRAPH_CANVAS_EMBED_SHELL_CLASS}
            className="w-full"
          />
        </div>
      </DossierSectionBlockSkeleton>
    </div>
  );
}

/** Dossier Notes tab — full-height rich text editor. */
export function DossierNotesSkeletonLayout() {
  return (
    <DossierSectionBlockSkeleton titleWidth="w-12" showAction={false}>
      <Skeleton className="border-border min-h-[min(70vh,36rem)] w-full flex-1 rounded-md border" />
    </DossierSectionBlockSkeleton>
  );
}

/** Dedicated dossier tab with one primary section (Claims, Identifiers, Events, …). */
export function DossierPanelSkeletonLayout({
  variant = "list",
}: {
  variant?: "list" | "table" | "timeline" | "panel";
}) {
  return (
    <DossierSectionBlockSkeleton titleWidth="w-24">
      {variant === "table" ? (
        <div className="border-border overflow-hidden rounded-md border">
          <div className="border-border bg-muted/30 flex h-8 items-center gap-2 border-b px-3">
            {["w-24", "w-14", "w-14", "w-12", "w-16"].map((width) => (
              <Skeleton key={width} className={cn("h-2.5 shrink-0", width)} />
            ))}
          </div>
          <TableBodySkeletonLayout rows={8} columns={5} />
        </div>
      ) : null}
      {variant === "list" ? (
        <div className="flex flex-col gap-2">
          <DossierClaimRowSkeleton />
          <DossierClaimRowSkeleton />
          <DossierClaimRowSkeleton />
        </div>
      ) : null}
      {variant === "timeline" ? <DossierTimelineSkeleton rows={4} /> : null}
      {variant === "panel" ? (
        <div className="border-border flex min-h-[16rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      ) : null}
    </DossierSectionBlockSkeleton>
  );
}

/** Dossier Connections tab — list blocks + ego canvas. */
export function DossierConnectionsSkeletonLayout() {
  return (
    <DossierSectionBlockSkeleton titleWidth="w-24">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <DossierConnectionListSkeleton rows={2} />
        <GraphCanvasLoadingRegion
          label="Loading connections graph"
          shellClassName={GRAPH_CANVAS_CONNECTIONS_SHELL_CLASS}
        />
      </div>
    </DossierSectionBlockSkeleton>
  );
}

/** Dossier Evidence tab — dump actions + evidence rows. */
export function DossierEvidenceSkeletonLayout() {
  return (
    <DossierSectionBlockSkeleton titleWidth="w-20">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="border-border flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-4 min-w-0 flex-1" />
              <Skeleton className="h-3 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </DossierSectionBlockSkeleton>
  );
}
