import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { CaseSettingsForm } from "@/domains/cases/components/case-settings-form";
import {
  buildCaseOverviewActivity,
  CASE_OVERVIEW_ACTIVITY_LIMIT,
  jobEntityLabelsForActivity,
} from "@/domains/cases/lib/overview-activity";
import type { CaseRecord } from "@/domains/cases/types";
import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import type { CaseEdgeRecord } from "@/domains/entities/edges/types";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import type { EntityRecord } from "@/domains/entities/types";
import { evidenceListQuery } from "@/domains/intake/queries";
import type { EvidenceRecord } from "@/domains/intake/types";
import { countLiveJobs } from "@/domains/jobs/lib/status";
import { jobsListQuery } from "@/domains/jobs/queries";
import type { JobListRecord } from "@/domains/jobs/types";
import { proposalsByStatusQuery } from "@/domains/triage/queries";
import { errMessage, cn } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import {
  invalidateAfterEntityChanged,
  invalidateAfterEvidenceMutation,
  invalidateAfterJobMutation,
  invalidateAfterProposalQueueChange,
  invalidateAfterTaskMutation,
} from "@/shared/lib/query-invalidation";
import { anyQueryPlaceholderData } from "@/shared/lib/query-placeholder";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { RelativeTime } from "@/shared/ui/relative-time";
import { TimelineDot, TimelineSpine } from "@/shared/ui/timeline-spine";
import type { ProposalRecord } from "@watchdog/core";
import { activityKindLabel, isProposalQueueLiveEvent } from "@watchdog/schemas";

function caseOverviewQueries(caseId: string) {
  return [
    edgesForCaseQuery(caseId),
    evidenceListQuery(caseId),
    evidenceListQuery(caseId, { hiddenOnly: true }),
    jobsListQuery(caseId),
    proposalsByStatusQuery(caseId, "pending"),
  ] as const;
}

const EMPTY_EDGES: CaseEdgeRecord[] = [];
const EMPTY_EVIDENCE: EvidenceRecord[] = [];
const EMPTY_JOBS: JobListRecord[] = [];
const EMPTY_PROPOSALS: ProposalRecord[] = [];

interface StatTile {
  id: string;
  label: string;
  value: number | string;
  to?:
    | "/entities"
    | "/identifiers"
    | "/graph"
    | "/tasks"
    | "/collect"
    | "/triage";
  tone?: "warn";
}

export function CaseOverviewTab({
  caseId,
  caseRow,
  entities,
  identifiers,
  listsPending = false,
  listsPlaceholder = false,
}: {
  caseId: string;
  caseRow: CaseRecord;
  entities: EntityRecord[];
  identifiers: CaseIdentifierRecord[];
  listsPending?: boolean;
  listsPlaceholder?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryResults = useQueries({
    queries: caseOverviewQueries(caseId),
  });
  const [
    edgesQuery,
    evidenceQuery,
    hiddenEvidenceQuery,
    jobsQuery,
    pendingProposalsQuery,
  ] = queryResults;
  const edges = edgesQuery.data ?? EMPTY_EDGES;
  const evidence = evidenceQuery.data ?? EMPTY_EVIDENCE;
  const hiddenEvidence = hiddenEvidenceQuery.data ?? EMPTY_EVIDENCE;
  const jobs = jobsQuery.data ?? EMPTY_JOBS;
  const pendingProposals = pendingProposalsQuery.data ?? EMPTY_PROPOSALS;
  const overviewPending = queryResults.some((query) => listPending(query));
  const overviewLoadError =
    !overviewPending && queryResults.some((query) => query.isError)
      ? errMessage(
          queryResults.find((query) => query.isError)?.error,
          "Failed to load case overview"
        )
      : null;
  const statsPending = listsPending || overviewPending;
  const overviewPlaceholder =
    listsPlaceholder || anyQueryPlaceholderData(queryResults);

  useLiveEvents(caseId, (event) => {
    if (event.type === "job_update") {
      void invalidateAfterJobMutation(queryClient, caseId);
    }
    if (isProposalQueueLiveEvent(event)) {
      void invalidateAfterProposalQueueChange(queryClient, caseId);
    }
    if (event.type === "entity_changed") {
      void invalidateAfterEntityChanged(queryClient, caseId);
    }
    if (event.type === "task_changed") {
      void invalidateAfterTaskMutation(queryClient, caseId);
    }
    if (event.type === "evidence_changed") {
      void invalidateAfterEvidenceMutation(queryClient, caseId);
    }
  });

  const liveJobCount = useMemo(() => countLiveJobs(jobs), [jobs]);

  const tiles: StatTile[] = useMemo(
    () => [
      {
        id: "entities",
        label: "Entities",
        value: statsPending ? "—" : entities.length,
        to: "/entities",
      },
      {
        id: "identifiers",
        label: "Identifiers",
        value: statsPending ? "—" : identifiers.length,
        to: "/identifiers",
      },
      {
        id: "connections",
        label: "Connections",
        value: statsPending ? "—" : edges.length,
        to: "/graph",
      },
      {
        id: "evidence",
        label: "Evidence",
        value: statsPending ? "—" : evidence.length,
        to: "/collect",
      },
      {
        id: "live",
        label: "Live jobs",
        value: statsPending ? "—" : liveJobCount,
        to: "/collect",
      },
      {
        id: "inbox",
        label: "Pending proposals",
        value: statsPending ? "—" : pendingProposals.length,
        tone: !statsPending && pendingProposals.length > 0 ? "warn" : undefined,
        to: "/triage",
      },
    ],
    [
      statsPending,
      entities.length,
      identifiers.length,
      edges.length,
      evidence.length,
      liveJobCount,
      pendingProposals.length,
    ]
  );

  const entityLabels = useMemo(
    () => jobEntityLabelsForActivity(jobs, entities),
    [entities, jobs]
  );

  const activity = useMemo(
    () =>
      buildCaseOverviewActivity(
        evidence,
        jobs,
        pendingProposals,
        CASE_OVERVIEW_ACTIVITY_LIMIT,
        hiddenEvidence,
        entityLabels
      ),
    [evidence, hiddenEvidence, jobs, pendingProposals, entityLabels]
  );

  return (
    <div className="flex flex-col gap-6">
      {overviewLoadError ? (
        <FetchErrorAlert
          error={overviewLoadError}
          onRetry={() => {
            for (const query of queryResults) {
              if (query.isError) void query.refetch();
            }
          }}
        />
      ) : null}
      <section
        aria-label="Case stats"
        className={cn(
          "grid gap-2 sm:grid-cols-2 lg:grid-cols-3",
          placeholderDeemphasisClass(overviewPlaceholder)
        )}
      >
        {tiles.map((tile) => {
          const className = cn(
            "border-border flex flex-col gap-1 rounded-md border px-3 py-2.5 text-left transition-colors",
            tile.to &&
              "hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none",
            tile.tone === "warn" && "border-warning/40"
          );
          const body = (
            <>
              <span
                className={cn(
                  "font-mono text-2xl font-semibold tracking-tight tabular-nums",
                  tile.tone === "warn" && "text-warning"
                )}
              >
                {tile.value}
              </span>
              <span className="text-label-sm text-muted-foreground">
                {tile.label}
              </span>
            </>
          );
          if (tile.to) {
            const to = tile.to;
            return (
              <button
                key={tile.id}
                type="button"
                className={className}
                onClick={() => {
                  void navigate({ to });
                }}
              >
                {body}
              </button>
            );
          }
          return (
            <div key={tile.id} className={className}>
              {body}
            </div>
          );
        })}
      </section>

      <div
        className={cn(
          "grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,22rem)]",
          placeholderDeemphasisClass(overviewPlaceholder)
        )}
      >
        <section aria-label="Recent activity" className="min-w-0">
          <h2 className="text-label-sm text-muted-foreground mb-2 font-medium">
            Recent activity
          </h2>
          {activity.length === 0 ? (
            <EmptyState
              intent="blank-slate"
              items="activity"
              title="Nothing yet"
              description="Evidence, jobs, and proposals for this Case will show up here."
            />
          ) : (
            <TimelineSpine className="ml-2 pl-4">
              {activity.map((item) => (
                <div key={item.id} className="relative pb-3 last:pb-0">
                  <TimelineDot className="bg-foreground top-1.5 -left-[1.3rem] size-2" />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-muted-foreground text-chip mr-1.5 uppercase">
                        {activityKindLabel(item.kind)}
                      </span>
                      <Link
                        to={item.href.to}
                        search={item.href.search}
                        className="text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {item.label}
                      </Link>
                    </div>
                    <RelativeTime
                      value={item.at}
                      className="text-muted-foreground shrink-0 text-xs"
                    />
                  </div>
                </div>
              ))}
            </TimelineSpine>
          )}
        </section>

        <CaseSettingsForm caseId={caseId} caseRow={caseRow} />
      </div>
    </div>
  );
}
