import { useSuspenseQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, type ReactNode } from "react";

import { casesContextQuery } from "@/domains/cases/queries";
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
import { jobsListQuery } from "@/domains/jobs/queries";
import { tasksListQuery } from "@/domains/tasks/queries";
import { proposalsByStatusQuery } from "@/domains/triage/queries";
import { useHydrated } from "@/shared/hooks/use-hydrated";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { Page, PageHeader } from "@/shared/layout/page";
import {
  bindCasesChangedInvalidation,
  invalidateAfterJobMutation,
  invalidateAfterProposalQueueChange,
  invalidateAfterTaskMutation,
} from "@/shared/lib/query-invalidation";
import { stackPendingFallback } from "@/shared/ui/active-tab-body";
import { RegionBoundary } from "@/shared/ui/region-boundary";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/shared/ui/shadcn/resizable";

const OVERVIEW_DEFAULT = "68%";
const ACTIVITY_DEFAULT = "32%";

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

function DashboardActive({
  active,
  caseCount,
}: {
  active: CaseRecord;
  caseCount: number;
}) {
  const queryClient = useQueryClient();
  const [
    { data: pendingProposals },
    { data: jobsRaw },
    { data: tasksRaw },
    { data: entities },
  ] = useSuspenseQueries({
    queries: [
      proposalsByStatusQuery(active.id, "pending"),
      jobsListQuery(active.id),
      tasksListQuery(active.id),
      entitiesListQuery(active.id),
    ],
  });

  useLiveEvents(active.id, (event) => {
    if (event.type === "job_update") {
      void invalidateAfterJobMutation(queryClient, active.id);
    }
    if (event.type === "proposal_created") {
      void invalidateAfterProposalQueueChange(queryClient, active.id);
    }
    if (event.type === "task_changed") {
      void invalidateAfterTaskMutation(queryClient, active.id);
    }
  });

  const proposals = useMemo(
    () => selectRecentProposals(pendingProposals),
    [pendingProposals]
  );
  const dueTasks = useMemo(() => selectDueTasks(tasksRaw), [tasksRaw]);

  const tiles = buildOverviewTiles(caseCount, {
    proposalsPending: pendingProposals.length,
    tasksOverdue: countOverdueTasks(tasksRaw),
    tasksDueSoon: countNearDueTasks(tasksRaw),
    jobsRunning: countLiveJobs(jobsRaw),
    entities: entities.length,
  });

  return (
    <>
      <MetricsSection tiles={tiles} />
      <div className="grid min-h-0 gap-6 lg:grid-cols-2 lg:items-start">
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
    return (
      <RegionBoundary fallback={stackPendingFallback(2)}>
        <DashboardActive active={active} caseCount={caseCount} />
      </RegionBoundary>
    );
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

export function DashboardHome() {
  const queryClient = useQueryClient();
  const [{ data: casesCtx }] = useSuspenseQueries({
    queries: [casesContextQuery()],
  });
  const active = casesCtx.active;

  useEffect(() => bindCasesChangedInvalidation(queryClient), [queryClient]);

  return (
    <Page density="split">
      <PageHeader />

      <DashboardSplit
        overview={
          <DashboardOverview
            active={active}
            caseCount={casesCtx.cases.length}
          />
        }
        activity={<RecentActivity cases={casesCtx.cases} />}
      />
    </Page>
  );
}
