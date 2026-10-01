import { BuildingIcon, CalendarIcon, ServerIcon, UserIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { GuideSection } from "@/routes/_protected/ui/-guide-chrome";
import { STATUS_TONES } from "@/shared/ui/vocab/status.lib";
import {
  TASK_PRIORITY_TONE_MAP,
  taskPriorityShortLabel,
} from "@/shared/ui/vocab/task-priority.lib";
import type { TaskPriority } from "@watchdog/schemas";

/* Static mockups for choosing the task card layout. Plain elements on purpose: they are
 * pictures of the same four tasks in six layouts, not wired cards. Every layout is shown at
 * the narrowest real column width (14rem). */

type EntityKind = "person" | "infra" | "org";

interface Sample {
  title: string;
  priority?: TaskPriority;
  entity?: { name: string; kind: EntityKind };
  description?: string;
  due?: string;
  overdue?: boolean;
  updated?: string;
  done?: boolean;
}

const SAMPLES: Sample[] = [
  {
    title: "Pull the registrar receipt, not just the WHOIS text",
    description:
      "WHOIS shows the registrant string only. Ask the registrar for the receipt that ties the card to the order, then attach it as Evidence.",
    priority: "high",
    entity: { name: "ashmerefulfillment.example", kind: "infra" },
    due: "Oct 9",
    overdue: true,
    updated: "2d ago",
  },
  {
    title: "Archive the tracking page again before the footer changes",
    priority: "high",
    entity: { name: "ship-ashmere.example", kind: "infra" },
    due: "Oct 9",
    overdue: true,
  },
  {
    title: "Find a second source for the “sells the template” post",
    priority: "medium",
    entity: { name: "Marek Ellison", kind: "person" },
  },
  {
    title:
      "Ask Northwharf whether box 14 mail is handed to the holder or the clerk",
  },
  {
    title: "Hold the Lena / Marek merge",
    priority: "high",
    entity: { name: "Pell Receipts", kind: "org" },
    due: "Oct 12",
  },
  {
    title: "Record the shared A record",
    priority: "low",
    entity: { name: "203.0.113.44", kind: "infra" },
    done: true,
  },
];

const KIND_ICON: Record<EntityKind, typeof UserIcon> = {
  person: UserIcon,
  infra: ServerIcon,
  org: BuildingIcon,
};

const DOT_CLASS: Record<TaskPriority, string> = {
  high: "bg-status-pending",
  medium: "bg-status-running",
  low: "bg-status-unknown",
};

const CARD =
  "border-border bg-background group relative flex w-full flex-col rounded-md border";

function titleClass(sample: Sample, extra?: string) {
  return cn(
    "text-xs leading-snug font-normal break-words",
    sample.done && "text-muted-foreground line-through",
    extra
  );
}

function PriorityDot({ priority }: { priority: TaskPriority }) {
  return (
    <span
      role="img"
      aria-label={`${priority} priority`}
      className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[priority])}
    />
  );
}

function Chip({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm px-1 py-px text-xs leading-none font-normal tracking-wider uppercase",
        STATUS_TONES[TASK_PRIORITY_TONE_MAP[priority]].low
      )}
    >
      {taskPriorityShortLabel(priority)}
    </span>
  );
}

function Due({ sample }: { sample: Sample }) {
  if (!sample.due) return null;
  return (
    <span
      className={cn(
        "text-2xs inline-flex shrink-0 items-center gap-1 font-mono font-light tabular-nums",
        sample.overdue ? "text-destructive" : "text-muted-foreground"
      )}
    >
      <CalendarIcon className="size-3 opacity-70" aria-hidden />
      {sample.due}
    </span>
  );
}

function Desc({ sample }: { sample: Sample }) {
  if (!sample.description) return null;
  return (
    <p className="text-muted-foreground line-clamp-2 text-xs leading-snug">
      {sample.description}
    </p>
  );
}

function Updated({ sample }: { sample: Sample }) {
  if (!sample.updated) return null;
  return (
    <span className="text-muted-foreground text-2xs font-mono">
      {sample.updated}
    </span>
  );
}

function EntityText({ sample }: { sample: Sample }) {
  if (!sample.entity) return null;
  const Icon = KIND_ICON[sample.entity.kind];
  return (
    <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{sample.entity.name}</span>
    </span>
  );
}

function EntityPill({ sample }: { sample: Sample }) {
  if (!sample.entity) return null;
  const Icon = KIND_ICON[sample.entity.kind];
  return (
    <span className="bg-secondary text-foreground/80 inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{sample.entity.name}</span>
    </span>
  );
}

/* A. What ships today. */
function CardCurrent({ sample }: { sample: Sample }) {
  return (
    <div className={cn(CARD, "gap-1.5 px-2.5 py-2")}>
      <div className={titleClass(sample, "line-clamp-2")}>{sample.title}</div>
      <Desc sample={sample} />
      {sample.priority || sample.entity || sample.due ? (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {sample.priority ? <Chip priority={sample.priority} /> : null}
          <EntityPill sample={sample} />
          <span className="ml-auto inline-flex items-center gap-2">
            <Updated sample={sample} />
            <Due sample={sample} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* B. Linear: priority bars lead, entity as quiet text, one footer line. */
function CardLinear({ sample }: { sample: Sample }) {
  return (
    <div className={cn(CARD, "gap-2 px-2.5 py-2")}>
      <div className="flex items-start gap-2">
        {sample.priority ? (
          <span className="mt-1">
            <Chip priority={sample.priority} />
          </span>
        ) : null}
        <div className={titleClass(sample, "line-clamp-2 min-w-0 flex-1")}>
          {sample.title}
        </div>
      </div>
      <Desc sample={sample} />
      {sample.entity || sample.due ? (
        <div className="flex items-center justify-between gap-2">
          <EntityText sample={sample} />
          <span className="inline-flex items-center gap-2">
            <Updated sample={sample} />
            <Due sample={sample} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* C. Quiet: priority dot beside the title, a single muted meta line, no chips. */
function CardQuiet({ sample }: { sample: Sample }) {
  return (
    <div className={cn(CARD, "gap-1 px-2.5 py-2")}>
      <div className="flex items-start gap-2">
        <span className="mt-[7px]">
          {sample.priority ? (
            <PriorityDot priority={sample.priority} />
          ) : (
            <span className="bg-foreground/10 block size-1.5 rounded-full" />
          )}
        </span>
        <div className={titleClass(sample, "line-clamp-2 min-w-0 flex-1")}>
          {sample.title}
        </div>
      </div>
      {sample.description ? (
        <div className="pl-3.5">
          <Desc sample={sample} />
        </div>
      ) : null}
      {sample.entity || sample.due ? (
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 pl-3.5 text-xs">
          <span className="truncate">{sample.entity?.name}</span>
          {sample.entity && sample.due ? <span aria-hidden>·</span> : null}
          {sample.due ? (
            <span
              className={cn(
                "shrink-0 font-mono tabular-nums",
                sample.overdue && "text-destructive"
              )}
            >
              {sample.due}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* D. Eyebrow: entity (kind icon + name) above the title, priority bars + due below. */
function CardEyebrow({ sample }: { sample: Sample }) {
  return (
    <div className={cn(CARD, "gap-1 px-2.5 py-2")}>
      {sample.entity ? <EntityText sample={sample} /> : null}
      <div className={titleClass(sample, "line-clamp-2")}>{sample.title}</div>
      <Desc sample={sample} />
      {sample.priority || sample.due ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          {sample.priority ? <Chip priority={sample.priority} /> : <span />}
          <span className="inline-flex items-center gap-2">
            <Updated sample={sample} />
            <Due sample={sample} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* E. Two-row dense: one truncated title line, one mono meta line. Most cards per screen.
 * Drops the description and updated stamp on purpose; they live in the Detail pane. */
function CardDense({ sample }: { sample: Sample }) {
  return (
    <div className={cn(CARD, "gap-0.5 px-2.5 py-1.5")}>
      <div className="flex items-center gap-2">
        {sample.priority ? <PriorityDot priority={sample.priority} /> : null}
        <div className={titleClass(sample, "min-w-0 flex-1 truncate")}>
          {sample.title}
        </div>
      </div>
      <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
        <EntityText sample={sample} />
        <span className="ml-auto shrink-0">
          <Due sample={sample} />
        </span>
      </div>
    </div>
  );
}

/* F. Footer bar: title block, then a ruled footer holding every attribute in one row. */
function CardFooterBar({ sample }: { sample: Sample }) {
  const hasFooter =
    sample.priority !== undefined ||
    sample.entity !== undefined ||
    sample.due !== undefined;
  return (
    <div className={cn(CARD, "overflow-hidden")}>
      <div className="space-y-1 px-2.5 py-2">
        <div className={titleClass(sample, "line-clamp-2")}>{sample.title}</div>
        <Desc sample={sample} />
      </div>
      {hasFooter ? (
        <div className="border-border bg-muted/20 flex min-w-0 items-center gap-2 border-t px-2.5 py-1">
          {sample.priority ? <Chip priority={sample.priority} /> : null}
          <EntityText sample={sample} />
          <span className="ml-auto inline-flex items-center gap-2">
            <Updated sample={sample} />
            <Due sample={sample} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* G. Header only: entity + priority share one tinted top bar; title and due date sit on the plain body. */
function CardTopBar({ sample }: { sample: Sample }) {
  const hasBar = sample.entity !== undefined || sample.priority !== undefined;
  return (
    <div className={cn(CARD, "overflow-hidden")}>
      {hasBar ? (
        <div className="border-border bg-muted/20 flex h-6 min-w-0 items-center gap-2 border-b px-2.5">
          <EntityText sample={sample} />
          {sample.priority ? (
            <span className="ml-auto">
              <Chip priority={sample.priority} />
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-1 px-2.5 py-2">
        <div className={titleClass(sample, "line-clamp-2")}>{sample.title}</div>
        {sample.due ? <Due sample={sample} /> : null}
      </div>
    </div>
  );
}

/* H. Header bar, bare footer: the entity bar stays; priority and due sit on the body with no tint or rule. */
function CardHeaderOnly({ sample }: { sample: Sample }) {
  return (
    <div className={cn(CARD, "overflow-hidden")}>
      {sample.entity ? (
        <div className="border-border bg-muted/20 flex h-6 min-w-0 items-center border-b px-2.5">
          <EntityText sample={sample} />
        </div>
      ) : null}
      <div className="space-y-1.5 px-2.5 py-2">
        <div className={titleClass(sample, "line-clamp-2")}>{sample.title}</div>
        {sample.priority || sample.due ? (
          <div className="flex items-center justify-between gap-2">
            {sample.priority ? <Chip priority={sample.priority} /> : <span />}
            <Due sample={sample} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* I. Two tones: the tinted header is darker than the body, and the footer shares the body's tone,
 * separated by a rule only. Reads as a "tab" on top instead of a sandwich. */
function CardTab({ sample }: { sample: Sample }) {
  return (
    <div className={cn(CARD, "overflow-hidden")}>
      {sample.entity ? (
        <div className="bg-muted/40 flex h-6 min-w-0 items-center px-2.5">
          <EntityText sample={sample} />
        </div>
      ) : null}
      <div className="px-2.5 py-2">
        <div className={titleClass(sample, "line-clamp-2")}>{sample.title}</div>
      </div>
      {sample.priority || sample.due ? (
        <div className="border-border flex h-6 min-w-0 items-center gap-2 border-t px-2.5">
          {sample.priority ? <Chip priority={sample.priority} /> : null}
          <span className="ml-auto">
            <Due sample={sample} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* J. Dividers only: no tint anywhere. Entity line, title, and footer are separated by hairlines. */
function CardRuled({ sample }: { sample: Sample }) {
  return (
    <div className={cn(CARD, "divide-border divide-y overflow-hidden")}>
      {sample.entity ? (
        <div className="flex h-6 min-w-0 items-center px-2.5">
          <EntityText sample={sample} />
        </div>
      ) : null}
      <div className="px-2.5 py-2">
        <div className={titleClass(sample, "line-clamp-2")}>{sample.title}</div>
      </div>
      {sample.priority || sample.due ? (
        <div className="flex h-6 min-w-0 items-center gap-2 px-2.5">
          {sample.priority ? <Chip priority={sample.priority} /> : null}
          <span className="ml-auto">
            <Due sample={sample} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* K. Entity as a tinted pill in the body (the old chip), footer bar only. */
function CardPillFooter({ sample }: { sample: Sample }) {
  return (
    <div className={cn(CARD, "overflow-hidden")}>
      <div className="space-y-1.5 px-2.5 py-2">
        <div className={titleClass(sample, "line-clamp-2")}>{sample.title}</div>
        <EntityPill sample={sample} />
      </div>
      {sample.priority || sample.due ? (
        <div className="border-border bg-muted/20 flex h-6 min-w-0 items-center gap-2 border-t px-2.5">
          {sample.priority ? <Chip priority={sample.priority} /> : null}
          <span className="ml-auto">
            <Due sample={sample} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Variant({
  label,
  blurb,
  children,
}: {
  label: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="text-muted-foreground text-xs">{blurb}</p>
      </div>
      <div className="border-border bg-muted/10 flex w-[15.5rem] flex-col gap-1.5 rounded-md border p-1.5">
        {children}
      </div>
    </div>
  );
}

const VARIANTS: {
  label: string;
  blurb: string;
  Card: (props: { sample: Sample }) => ReactNode;
}[] = [
  {
    label: "A · Current",
    blurb: "Title, then chips: priority, entity, due.",
    Card: CardCurrent,
  },
  {
    label: "B · Linear",
    blurb:
      "Priority chip leads the title; entity is plain text; one footer line.",
    Card: CardLinear,
  },
  {
    label: "C · Quiet",
    blurb: "Priority dot, title, one muted meta line. No chips at all.",
    Card: CardQuiet,
  },
  {
    label: "D · Eyebrow",
    blurb: "Entity above the title, priority and due below.",
    Card: CardEyebrow,
  },
  {
    label: "E · Dense",
    blurb: "Single-line title, one meta line. Most cards per screen.",
    Card: CardDense,
  },
  {
    label: "F · Footer bar",
    blurb: "Title block over a ruled footer that holds every attribute.",
    Card: CardFooterBar,
  },
  {
    label: "G · Top bar",
    blurb: "One tinted bar on top: entity left, priority right. No footer bar.",
    Card: CardTopBar,
  },
  {
    label: "H · Header only",
    blurb: "Tinted entity header; priority and due sit bare on the body.",
    Card: CardHeaderOnly,
  },
  {
    label: "I · Tab",
    blurb:
      "Darker header like a tab; footer is just a rule, same tone as the body.",
    Card: CardTab,
  },
  {
    label: "J · Ruled",
    blurb: "No tint at all: hairlines separate entity, title, and footer.",
    Card: CardRuled,
  },
  {
    label: "K · Pill + footer",
    blurb: "Entity as a pill under the title; only the footer is tinted.",
    Card: CardPillFooter,
  },
];

export function TaskCardsSection() {
  return (
    <GuideSection
      id="task-cards"
      title="Task cards"
      blurb="Eleven layouts for the same six tasks (G–K are header/footer treatments that avoid the tinted-top-and-bottom sandwich) (the first carries every field: description, priority, entity, due date, updated stamp; then long title, short, no meta, done), at the narrowest column width. Pick one and the real card follows."
    >
      <div className="flex flex-wrap gap-6">
        {VARIANTS.map(({ label, blurb, Card }) => (
          <Variant key={label} label={label} blurb={blurb}>
            {SAMPLES.map((sample) => (
              <Card key={sample.title} sample={sample} />
            ))}
          </Variant>
        ))}
      </div>
    </GuideSection>
  );
}
