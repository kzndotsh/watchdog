import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, type ReactNode } from "react";

import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import type { CaseRecord } from "@/domains/cases/types";
import {
  DashboardDueTasksSection,
  DashboardTriageSection,
} from "@/domains/dashboard/components/dashboard-panels";
import {
  MetricsSection,
  type MetricTile,
} from "@/domains/dashboard/components/metrics-section";
import { RecentActivity } from "@/domains/dashboard/components/recent-activity";
import {
  countLiveJobs,
  countNearDueTasks,
  countOverdueTasks,
  selectDueTasks,
  selectRecentProposals,
} from "@/domains/dashboard/lib/selectors";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { jobsListQuery } from "@/domains/jobs/queries";
import type { JobListRecord } from "@/domains/jobs/types";
import { tasksListQuery } from "@/domains/tasks/queries";
import type { TaskRecord } from "@/domains/tasks/types";
import { proposalsByStatusQuery } from "@/domains/triage/queries";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/shared/hooks/use-hydrated";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { Page, PageHeader } from "@/shared/layout/page";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import {
  bindCasesChangedInvalidation,
  invalidateAfterEntityChanged,
  invalidateAfterEvidenceMutation,
  invalidateAfterJobMutation,
  invalidateAfterProposalQueueChange,
  invalidateAfterTaskMutation,
} from "@/shared/lib/query-invalidation";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import { anyQueryPlaceholderData } from "@/shared/lib/query-placeholder";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { PendingRegion } from "@/shared/ui/pending-region";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/shared/ui/shadcn/resizable";
import {
  DashboardActivityPanelSkeleton,
  DashboardOverviewSkeleton,
} from "@/shared/ui/skeletons";
import type { ProposalRecord } from "@watchdog/core";
import { isProposalQueueLiveEvent } from "@watchdog/schemas";

const OVERVIEW_DEFAULT = "68%";
const ACTIVITY_DEFAULT = "32%";

function dashboardOverviewPending() {
  return (
    <PendingRegion
      loading
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
      loading
      label="Loading recent activity"
      fallback={<DashboardActivityPanelSkeleton />}
    >
      {null}
    </PendingRegion>
  );
}

interface OverviewMetrics {
  proposalsPending: number;
  tasksOverdue: number;
  tasksDueSoon: number;
  jobsRunning: number;
  entities: number;
}

function countTone(
  muted: boolean,
  count: number
): NonNullable<MetricTile["tone"]> {
  if (muted) return "muted";
  if (count > 0) return "warn";
  return "default";
}

function idleTone(muted: boolean): NonNullable<MetricTile["tone"]> {
  return muted ? "muted" : "default";
}

function buildOverviewTiles(
  caseCount: number,
  metrics: OverviewMetrics | null
): MetricTile[] {
  const muted = metrics === null;
  return [
    {
      id: "inbox",
      label: "Proposals pending",
      to: "/triage",
      value: muted ? 0 : metrics.proposalsPending,
      tone: countTone(muted, muted ? 0 : metrics.proposalsPending),
    },
    {
      id: "overdue",
      label: "Tasks overdue",
      to: "/tasks",
      value: muted ? "—" : metrics.tasksOverdue,
      tone: countTone(muted, muted ? 0 : metrics.tasksOverdue),
    },
    {
      id: "due",
      label: "Tasks due soon",
      to: "/tasks",
      value: muted ? "—" : metrics.tasksDueSoon,
      tone: idleTone(muted),
      hint: muted ? undefined : "Next 7 days",
    },
    {
      id: "live",
      label: "Jobs running",
      to: "/collect",
      value: muted ? "—" : metrics.jobsRunning,
      tone: idleTone(muted),
    },
    {
      id: "entities",
      label: "Entities",
      to: "/entities",
      value: muted ? "—" : metrics.entities,
      tone: idleTone(muted),
    },
    {
      id: "cases",
      label: "Cases",
      to: "/cases",
      value: caseCount,
    },
  ];
}

function DashboardIdle({ caseCount }: { caseCount: number }) {
  return (
    <>
      <MetricsSection tiles={buildOverviewTiles(caseCount, null)} />
      <div className="grid min-h-0 gap-6 lg:grid-cols-2 lg:items-start">
        <DashboardTriageSection hasCase={false} proposals={[]} />
        <DashboardDueTasksSection hasCase={false} tasks={[]} />
      </div>
    </>
  );
}

function dashboardActiveQueries(caseId: string) {
  return [
    proposalsByStatusQuery(caseId, "pending"),
    jobsListQuery(caseId),
    tasksListQuery(caseId),
    entitiesListQuery(caseId),
  ] as const;
}

const EMPTY_PROPOSALS: ProposalRecord[] = [];
const EMPTY_JOBS: JobListRecord[] = [];
const EMPTY_TASKS: TaskRecord[] = [];
const EMPTY_ENTITIES: EntityRecord[] = [];

function DashboardActive({
  active,
  caseCount,
}: {
  active: CaseRecord;
  caseCount: number;
}) {
  const queryClient = useQueryClient();
  const queryResults = useQueries({
    queries: dashboardActiveQueries(active.id),
  });
  const [pendingProposalsQuery, jobsQuery, tasksQuery, entitiesQuery] =
    queryResults;
  const overviewPending = queryResults.some((query) => listPending(query));
  const overviewLoadError = combinedQueryLoadError(
    queryResults,
    overviewPending,
    "Failed to load dashboard overview"
  );
  const overviewPlaceholder = anyQueryPlaceholderData(queryResults);
  const pendingProposals = pendingProposalsQuery.data ?? EMPTY_PROPOSALS;
  const jobsRaw = jobsQuery.data ?? EMPTY_JOBS;
  const tasksRaw = tasksQuery.data ?? EMPTY_TASKS;
  const entities = entitiesQuery.data ?? EMPTY_ENTITIES;

  useLiveEvents(active.id, (event) => {
    if (event.type === "job_update") {
      void invalidateAfterJobMutation(queryClient, active.id);
    }
    if (isProposalQueueLiveEvent(event)) {
      void invalidateAfterProposalQueueChange(queryClient, active.id);
    }
    if (event.type === "task_changed") {
      void invalidateAfterTaskMutation(queryClient, active.id);
    }
    if (event.type === "entity_changed") {
      void invalidateAfterEntityChanged(queryClient, active.id);
    }
    if (event.type === "evidence_changed") {
      void invalidateAfterEvidenceMutation(queryClient, active.id);
    }
  });

  const proposals = useMemo(
    () => selectRecentProposals(pendingProposals),
    [pendingProposals]
  );
  const dueTasks = useMemo(() => selectDueTasks(tasksRaw), [tasksRaw]);

  const tiles = buildOverviewTiles(
    caseCount,
    overviewPending
      ? null
      : {
          proposalsPending: pendingProposals.length,
          tasksOverdue: countOverdueTasks(tasksRaw),
          tasksDueSoon: countNearDueTasks(tasksRaw),
          jobsRunning: countLiveJobs(jobsRaw),
          entities: entities.length,
        }
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
        <DashboardTriageSection hasCase proposals={proposals} />
        <DashboardDueTasksSection hasCase tasks={dueTasks} />
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
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1 pb-2">
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
  const queryClient = useQueryClient();
  const {
    active,
    cases,
    pending: casesPending,
    loadError: casesLoadError,
    retry: retryCases,
  } = useCasesContext();

  useEffect(() => bindCasesChangedInvalidation(queryClient), [queryClient]);

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
