import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";

import { recentActivityQuery } from "@/domains/activity/queries";
import type { ActivityItem, ActivityKind } from "@/domains/activity/types";
import type { CaseRecord } from "@/domains/cases/types";
import { cn } from "@/lib/utils";
import { stackPendingFallback } from "@/shared/ui/active-tab-body";
import { ActorMention } from "@/shared/ui/actor-mention";
import { resolveSelectValue } from "@/shared/ui/control-chrome";
import { EmptyState } from "@/shared/ui/empty-state";
import { RelativeTime } from "@/shared/ui/relative-time";
import { SectionHeaderBar } from "@/shared/ui/section-header-bar";
import { ScrollArea } from "@/shared/ui/shadcn/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/shadcn/select";
import {
  StatusBadge,
  TaskStatusBadge,
  type DisplayStatus,
} from "@/shared/ui/vocab";
import {
  JOB_STATUSES,
  PROPOSAL_STATUSES,
  TASK_STATUSES,
  type TaskStatus,
} from "@watchdog/schemas";

const ALL_CASES = "__all__";

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

function isDisplayStatus(value: string): value is DisplayStatus {
  return (
    (JOB_STATUSES as readonly string[]).includes(value) ||
    (PROPOSAL_STATUSES as readonly string[]).includes(value)
  );
}

function ActivityStatus({
  kind,
  status,
}: {
  kind: ActivityKind;
  status: string | undefined;
}) {
  if (!status) return null;
  if (kind === "task" && isTaskStatus(status)) {
    return <TaskStatusBadge status={status} size="sm" />;
  }
  if ((kind === "job" || kind === "proposal") && isDisplayStatus(status)) {
    return <StatusBadge status={status} size="sm" />;
  }
  return null;
}

function StatusTransition({
  kind,
  fromStatus,
  toStatus,
}: {
  kind: ActivityKind;
  fromStatus: string | undefined;
  toStatus: string | undefined;
}) {
  if (!fromStatus || !toStatus) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <ActivityStatus kind={kind} status={fromStatus} />
      <span aria-hidden className="text-muted-foreground/70">
        →
      </span>
      <ActivityStatus kind={kind} status={toStatus} />
    </span>
  );
}

function ActivityRows({
  items,
  showCaseLink,
  caseSlugById,
}: {
  items: ActivityItem[];
  showCaseLink: boolean;
  caseSlugById: ReadonlyMap<string, string>;
}) {
  return (
    <ul className="divide-border divide-y">
      {items.map((item) => {
        const hasTransition = Boolean(item.fromStatus && item.toStatus);
        const showMeta = hasTransition || showCaseLink || Boolean(item.actor);
        const caseSlug = caseSlugById.get(item.caseId);

        return (
          <li key={`${item.kind}-${item.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2 px-0 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground text-chip uppercase">
                    {item.kind}
                  </span>
                  <span className="text-foreground text-chip font-medium uppercase">
                    {item.action}
                  </span>
                </div>
                <div className="mt-0.5 min-w-0">
                  {caseSlug ? (
                    <Link
                      to="/cases/$caseSlug"
                      params={{ caseSlug }}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{item.label}</span>
                  )}
                </div>
                {showMeta ? (
                  <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    {hasTransition ? (
                      <StatusTransition
                        kind={item.kind}
                        fromStatus={item.fromStatus}
                        toStatus={item.toStatus}
                      />
                    ) : null}
                    {showCaseLink ? (
                      <>
                        {hasTransition ? (
                          <span
                            aria-hidden
                            className="text-muted-foreground/60"
                          >
                            ·
                          </span>
                        ) : null}
                        {caseSlug ? (
                          <Link
                            to="/cases/$caseSlug"
                            params={{ caseSlug }}
                            className="underline-offset-2 hover:underline"
                          >
                            {item.caseName}
                          </Link>
                        ) : (
                          <span>{item.caseName}</span>
                        )}
                      </>
                    ) : null}
                    {item.actor ? (
                      <>
                        {hasTransition || showCaseLink ? (
                          <span
                            aria-hidden
                            className="text-muted-foreground/60"
                          >
                            ·
                          </span>
                        ) : null}
                        <ActorMention
                          prefix="By"
                          label={item.actor}
                          size="sm"
                        />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <RelativeTime
                value={item.at}
                className="text-muted-foreground shrink-0 text-xs"
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RecentActivityList({
  caseId,
  caseSlugById,
  onClearFilter,
}: {
  caseId: string | null;
  caseSlugById: ReadonlyMap<string, string>;
  onClearFilter: () => void;
}) {
  const { data: items, isFetching } = useSuspenseQuery(
    recentActivityQuery(caseId ? { caseId } : undefined)
  );

  if (items.length === 0) {
    if (caseId) {
      return (
        <EmptyState
          intent="no-results"
          items="activity"
          title="No activity for this Case"
          description="Try another Case or clear the filter."
          onClearFilters={onClearFilter}
        />
      );
    }
    return (
      <EmptyState
        intent="blank-slate"
        items="activity"
        title="Nothing yet"
        description="Evidence, jobs, proposals, and tasks across your cases will show up here."
      />
    );
  }

  return (
    <div
      className={cn(
        "transition-opacity duration-150",
        isFetching && "opacity-60"
      )}
    >
      <ActivityRows
        items={items}
        showCaseLink={caseId === null}
        caseSlugById={caseSlugById}
      />
    </div>
  );
}

export function RecentActivity({ cases }: { cases: CaseRecord[] }) {
  const [caseId, setCaseId] = useState<string | null>(null);
  const caseSlugById = new Map(cases.map((c) => [c.id, c.slug] as const));

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-2"
      aria-label="Recent activity"
    >
      <SectionHeaderBar
        variant="inline"
        className="shrink-0"
        title={
          <span className="text-muted-foreground font-normal tracking-wide normal-case">
            Activity
          </span>
        }
        action={
          cases.length > 0 ? (
            <Select
              value={caseId ?? ALL_CASES}
              onValueChange={(next) => {
                const id = resolveSelectValue(next);
                if (id === null) return;
                setCaseId(id === ALL_CASES ? null : id);
              }}
            >
              <SelectTrigger
                aria-label="Filter activity by case"
                size="sm"
                className="h-7 w-[11rem] text-xs"
              >
                <SelectValue placeholder="All cases">
                  {(value: string | null) => {
                    if (!value || value === ALL_CASES) return "All cases";
                    return (
                      cases.find((c) => c.id === value)?.name ?? "All cases"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={ALL_CASES}>All cases</SelectItem>
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full flex-col pr-3">
          <Suspense fallback={stackPendingFallback(1)}>
            <RecentActivityList
              caseId={caseId}
              caseSlugById={caseSlugById}
              onClearFilter={() => {
                setCaseId(null);
              }}
            />
          </Suspense>
        </div>
      </ScrollArea>
    </section>
  );
}
