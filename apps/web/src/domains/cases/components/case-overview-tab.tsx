import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { workHref } from "@/config/nav";
import { CaseSettingsForm } from "@/domains/cases/components/case-settings-form";
import { useCaseOverviewData } from "@/domains/cases/hooks/use-case-overview-data";
import { tileCount } from "@/domains/cases/lib/case-counts";
import type { CaseRecord } from "@/domains/cases/types";
import {
  MetricsSection,
  type MetricTile,
} from "@/domains/dashboard/components/metrics-section";
import { cn } from "@/lib/utils";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { FormSection } from "@/shared/ui/form-section";
import { RelativeTime } from "@/shared/ui/relative-time";
import { TabCount } from "@/shared/ui/tab-count";
import { TimelineDot } from "@/shared/ui/timeline-dot";
import { TimelineSpine } from "@/shared/ui/timeline-spine";
import type { ActivityKind } from "@watchdog/schemas/feed";
import type { ListTotal } from "@watchdog/schemas/shared";
import { ScrollArea } from "@watchdog/ui/components/scroll-area";

function inboxMetricTone(
  isStatsPending: boolean,
  pendingCount: number
): MetricTile["tone"] {
  if (isStatsPending) return "muted";
  if (pendingCount > 0) return "warn";
  return "default";
}

const ACTIVITY_GROUP_LABELS: Record<ActivityKind, string> = {
  evidence: "Evidence",
  job: "Jobs",
  proposal: "Proposals",
  task: "Tasks",
  handoff: "AI handoffs",
};

/** One section per kind, ordered by whichever kind has the newest item; newest first inside. */
function groupActivityByKind<T extends { kind: ActivityKind }>(
  items: readonly T[]
): { kind: ActivityKind; items: T[] }[] {
  const groups = new Map<ActivityKind, T[]>();
  for (const item of items) {
    const bucket = groups.get(item.kind);
    if (bucket) bucket.push(item);
    else groups.set(item.kind, [item]);
  }
  return [...groups].map(([kind, rows]) => ({ kind, items: rows }));
}

type CaseOverviewTabProps = {
  caseId: string;
  caseRow: CaseRecord;
};

export function CaseOverviewTab({ caseId, caseRow }: CaseOverviewTabProps) {
  const {
    counts,
    pendingProposalCount,
    pendingProposalLabel,
    activity,
    isPending: statsPending,
    isPlaceholder: overviewPlaceholder,
    loadError: overviewLoadError,
    retry,
  } = useCaseOverviewData(caseId);

  const tiles: MetricTile[] = useMemo(() => {
    const pendingTone =
      statsPending || counts === undefined ? "muted" : "default";
    const value = (total: ListTotal | undefined) =>
      statsPending || total === undefined ? "—" : tileCount(total);
    return [
      {
        id: "entities",
        label: "Entities",
        value: value(counts?.entities),
        to: workHref("entities", caseRow.slug),
        tone: pendingTone,
      },
      {
        id: "identifiers",
        label: "Identifiers",
        value: value(counts?.identifiers),
        to: workHref("identifiers", caseRow.slug),
        tone: pendingTone,
      },
      {
        id: "connections",
        label: "Connections",
        value: value(counts?.connections),
        to: workHref("graph", caseRow.slug),
        tone: pendingTone,
      },
      {
        id: "evidence",
        label: "Evidence",
        value: value(counts?.evidence),
        to: workHref("collect", caseRow.slug),
        tone: pendingTone,
      },
      {
        id: "live",
        label: "Live jobs",
        value: value(counts?.liveJobs),
        to: workHref("collect", caseRow.slug),
        tone: pendingTone,
      },
      {
        id: "inbox",
        label: "Pending proposals",
        value: statsPending ? "—" : pendingProposalLabel,
        tone: inboxMetricTone(statsPending, pendingProposalCount),
        to: workHref("triage", caseRow.slug),
      },
    ];
  }, [
    statsPending,
    counts,
    pendingProposalCount,
    pendingProposalLabel,
    caseRow.slug,
  ]);

  const activityGroups = useMemo(
    () => groupActivityByKind(activity),
    [activity]
  );

  return (
    <div className="flex flex-col gap-6">
      {overviewLoadError ? (
        <FetchErrorAlert error={overviewLoadError} onRetry={retry} />
      ) : null}
      <MetricsSection
        label="Case stats"
        tiles={tiles}
        className={placeholderDeemphasisClass(overviewPlaceholder)}
      />

      <div
        className={cn(
          "grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,22rem)]",
          placeholderDeemphasisClass(overviewPlaceholder)
        )}
      >
        <FormSection title="Recent activity" className="min-w-0">
          {activity.length === 0 ? (
            <EmptyState
              intent="blank-slate"
              items="activity"
              title="Nothing yet"
              description="Evidence, jobs, and proposals for this Case will show up here."
            />
          ) : (
            <ScrollArea className="-mx-1 h-[min(30rem,65vh)]">
              <div className="flex flex-col gap-5 px-1 pr-3">
                {activityGroups.map((group) => (
                  <div key={group.kind}>
                    <h3 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
                      {ACTIVITY_GROUP_LABELS[group.kind]}
                      <TabCount n={group.items.length} className="ml-0" />
                    </h3>
                    <TimelineSpine className="ml-2 pl-4">
                      {group.items.map((item) => (
                        <div key={item.id} className="relative pb-3 last:pb-0">
                          <TimelineDot className="bg-foreground" />
                          <div className="flex items-baseline gap-4">
                            <Link
                              to={item.href.to}
                              params={{ caseSlug: caseRow.slug }}
                              search={item.href.search}
                              title={item.label}
                              className="min-w-0 flex-1 truncate text-sm underline-offset-2 hover:underline"
                            >
                              {item.label}
                            </Link>
                            <RelativeTime
                              value={item.at}
                              className="text-muted-foreground shrink-0 text-xs"
                            />
                          </div>
                        </div>
                      ))}
                    </TimelineSpine>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </FormSection>

        <CaseSettingsForm caseId={caseId} caseRow={caseRow} />
      </div>
    </div>
  );
}
