import { useQueries } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";

import { workHref } from "@/config/nav";
import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import { tileCount } from "@/domains/cases/lib/case-counts";
import { caseCountsQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { DashboardDueTasksSection } from "@/domains/dashboard/components/dashboard-due-tasks-section";
import { DashboardTriageSection } from "@/domains/dashboard/components/dashboard-triage-section";
import {
  MetricsSection,
  type MetricTile,
} from "@/domains/dashboard/components/metrics-section";
import { RecentActivity } from "@/domains/dashboard/components/recent-activity";
import { selectRecentProposals } from "@/domains/dashboard/lib/selectors";
import { dueTasksQuery } from "@/domains/tasks/queries";
import type { TaskRecord } from "@/domains/tasks/types";
import { pendingProposalsQuery } from "@/domains/triage/queries";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/shared/hooks/use-hydrated";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import { anyQueryPlaceholderData } from "@/shared/lib/query-placeholder";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { PendingRegion } from "@/shared/ui/pending-region";
import {
  DashboardActivityPanelSkeleton,
  DashboardOverviewSkeleton,
} from "@/shared/ui/skeletons";
import type { ProposalQueueItem } from "@watchdog/core/proposals";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@watchdog/ui/components/resizable";

const OVERVIEW_DEFAULT = "68%";
const ACTIVITY_DEFAULT = "32%";

function dashboardOverviewPending() {
  return (
    <PendingRegion
      isLoading
      label="Loading dashboard overview"
      fallback={<DashboardOverviewSkeleton />}
    >
      {null}
    </PendingRegion>
  );
}

function dashboardActivityPanelPending() {
  return (
    <PendingRegion
      isLoading
      label="Loading recent activity"
      fallback={<DashboardActivityPanelSkeleton />}
    >
      {null}
    </PendingRegion>
  );
}

type OverviewMetrics = {
  proposalsPending: number;
  proposalsPendingLabel: number | string;
  tasksOverdue: number;
  tasksOverdueLabel: number | string;
  tasksDueSoon: number | string;
  jobsRunning: number | string;
  entities: number | string;
};

function countTone(
  isMuted: boolean,
  count: number
): NonNullable<MetricTile["tone"]> {
  if (isMuted) return "muted";
  if (count > 0) return "warn";
  return "default";
}

function idleTone(isMuted: boolean): NonNullable<MetricTile["tone"]> {
  return isMuted ? "muted" : "default";
}

function buildOverviewTiles(
  caseCount: number,
  metrics: OverviewMetrics | null,
  caseSlug?: string
): MetricTile[] {
  const isMuted = metrics === null;
  return [
    {
      id: "inbox",
      label: "Proposals pending",
      to: workHref("triage", caseSlug),
      value: isMuted ? 0 : metrics.proposalsPendingLabel,
      tone: countTone(isMuted, isMuted ? 0 : metrics.proposalsPending),
    },
    {
      id: "overdue",
      label: "Tasks overdue",
      to: workHref("tasks", caseSlug),
      value: isMuted ? "—" : metrics.tasksOverdueLabel,
      tone: countTone(isMuted, isMuted ? 0 : metrics.tasksOverdue),
    },
    {
      id: "due",
      label: "Tasks due soon",
      to: workHref("tasks", caseSlug),
      value: isMuted ? "—" : metrics.tasksDueSoon,
      tone: idleTone(isMuted),
      hint: isMuted ? undefined : "Next 7 days",
    },
    {
      id: "live",
      label: "Jobs running",
      to: workHref("collect", caseSlug),
      value: isMuted ? "—" : metrics.jobsRunning,
      tone: idleTone(isMuted),
    },
    {
      id: "entities",
      label: "Entities",
      to: workHref("entities", caseSlug),
      value: isMuted ? "—" : metrics.entities,
      tone: idleTone(isMuted),
    },
    {
      id: "cases",
      label: "Cases",
      to: { to: "/cases" },
      value: caseCount,
    },
  ];
}

function DashboardIdle({ caseCount }: { caseCount: number }) {
  return (
    <>
      <MetricsSection tiles={buildOverviewTiles(caseCount, null)} />
      <div className="grid min-h-0 gap-6 lg:grid-cols-2 lg:items-start">
        <DashboardTriageSection caseSlug={null} proposals={[]} />
        <DashboardDueTasksSection caseSlug={null} tasks={[]} />
      </div>
    </>
  );
}

function dashboardActiveQueries(caseId: string) {
  return [
    caseCountsQuery(caseId),
    pendingProposalsQuery(caseId),
    // The due list: its own small read (the first few and a total), never the board or the list.
    dueTasksQuery(caseId),
  ] as const;
}

const EMPTY_PROPOSALS: ProposalQueueItem[] = [];
const EMPTY_TASKS: TaskRecord[] = [];

function DashboardActive({
  active,
  caseCount,
}: {
  active: CaseRecord;
  caseCount: number;
}) {
  const queryResults = useQueries({
    queries: dashboardActiveQueries(active.id),
  });
  const [countsQuery, pendingQuery, tasksQuery] = queryResults;
  const overviewPending = queryResults.some((query) => listPending(query));
  const overviewLoadError = combinedQueryLoadError(
    queryResults,
    overviewPending,
    "Failed to load dashboard overview"
  );
  const overviewPlaceholder = anyQueryPlaceholderData(queryResults);
  const pendingProposals = pendingQuery.data?.items ?? EMPTY_PROPOSALS;
  const dueTasks = tasksQuery.data?.items ?? EMPTY_TASKS;
  const counts = countsQuery.data;

  const proposals = useMemo(
    () => selectRecentProposals(pendingProposals),
    [pendingProposals]
  );

  const tiles = buildOverviewTiles(
    caseCount,
    overviewPending || counts === undefined
      ? null
      : {
          proposalsPending: pendingQuery.data?.count ?? 0,
          proposalsPendingLabel: pendingQuery.data?.countLabel ?? 0,
          tasksOverdue: counts.tasksOverdue.count,
          tasksOverdueLabel: tileCount(counts.tasksOverdue),
          tasksDueSoon: tileCount(counts.tasksDueSoon),
          jobsRunning: tileCount(counts.liveJobs),
          entities: tileCount(counts.entities),
        },
    active.slug
  );

  if (overviewLoadError) {
    return (
      <FetchErrorAlert
        error={overviewLoadError}
        onRetry={() => {
          for (const query of queryResults) {
            if (query.isError) void query.refetch();
          }
        }}
      />
    );
  }

  if (overviewPending) {
    return dashboardOverviewPending();
  }

  return (
    <>
      <MetricsSection
        tiles={tiles}
        className={placeholderDeemphasisClass(overviewPlaceholder)}
      />
      <div
        className={cn(
          "grid min-h-0 gap-6 lg:grid-cols-2 lg:items-start",
          placeholderDeemphasisClass(overviewPlaceholder)
        )}
      >
        <DashboardTriageSection caseSlug={active.slug} proposals={proposals} />
        <DashboardDueTasksSection
          caseSlug={active.slug}
          tasks={dueTasks}
          total={tasksQuery.data?.total}
        />
      </div>
    </>
  );
}

function DashboardOverview({
  active,
  caseCount,
}: {
  active: CaseRecord | null;
  caseCount: number;
}) {
  if (active) {
    return <DashboardActive active={active} caseCount={caseCount} />;
  }
  return <DashboardIdle caseCount={caseCount} />;
}

function DashboardSplit({
  overview,
  activity,
}: {
  overview: ReactNode;
  activity: ReactNode;
}) {
  const hydrated = useHydrated();

  const overviewBody = (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      {overview}
    </div>
  );
  const activityBody = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden pt-1">
      {activity}
    </div>
  );

  // Match SplitView: plain flex before JS so panel sizes do not jump on hydrate.
  if (!hydrated) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex min-h-0 flex-col overflow-hidden"
          style={{ flexBasis: OVERVIEW_DEFAULT, flexShrink: 0 }}
        >
          {overviewBody}
        </div>
        <div className="bg-border h-px shrink-0" aria-hidden />
        <div
          className="flex min-h-0 flex-col overflow-hidden"
          style={{ flexBasis: ACTIVITY_DEFAULT, flexGrow: 1 }}
        >
          {activityBody}
        </div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation="vertical"
      className="min-h-0 flex-1 overflow-hidden"
    >
      <ResizablePanel
        id="dashboard-overview"
        defaultSize={OVERVIEW_DEFAULT}
        minSize="40%"
        className="flex min-h-0 flex-col"
      >
        {overviewBody}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        id="dashboard-activity"
        defaultSize={ACTIVITY_DEFAULT}
        minSize="18%"
        maxSize="55%"
        className="flex min-h-0 flex-col"
      >
        {activityBody}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export function DashboardHome({
  activityCaseId,
  onActivityCaseChange,
}: {
  activityCaseId?: string;
  onActivityCaseChange?: (next: string | null) => void;
} = {}) {
  const {
    active,
    cases,
    pending: casesPending,
    loadError: casesLoadError,
    retry: retryCases,
  } = useCasesContext();

  if (casesLoadError) {
    return (
      <Page density="split">
        <PageHeader />
        <FetchErrorAlert error={casesLoadError} onRetry={retryCases} />
      </Page>
    );
  }

  if (casesPending) {
    return (
      <Page density="split">
        <PageHeader />
        <DashboardSplit
          overview={dashboardOverviewPending()}
          activity={dashboardActivityPanelPending()}
        />
      </Page>
    );
  }

  return (
    <Page density="split">
      <PageHeader />

      <DashboardSplit
        overview={
          <DashboardOverview active={active} caseCount={cases.length} />
        }
        activity={
          <RecentActivity
            cases={cases}
            activityCaseId={activityCaseId}
            onActivityCaseChange={onActivityCaseChange}
          />
        }
      />
    </Page>
  );
}
