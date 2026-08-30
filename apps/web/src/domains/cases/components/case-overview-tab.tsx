import { useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { CaseSettingsForm } from "@/domains/cases/components/case-settings-form";
import { buildCaseOverviewActivity } from "@/domains/cases/lib/overview-activity";
import type { CaseRecord } from "@/domains/cases/types";
import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import type { CaseIdentifierRecord } from "@/domains/entities/identifiers/types";
import type { EntityRecord } from "@/domains/entities/types";
import { evidenceListQuery } from "@/domains/intake/queries";
import { LIVE_STATUSES } from "@/domains/jobs/lib/status";
import { jobsListQuery } from "@/domains/jobs/queries";
import { proposalsByStatusQuery } from "@/domains/triage/queries";
import { cn } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import {
  invalidateAfterJobMutation,
  invalidateAfterProposalQueueChange,
} from "@/shared/lib/query-invalidation";
import { EmptyState } from "@/shared/ui/empty-state";
import { RelativeTime } from "@/shared/ui/relative-time";
import { TimelineDot, TimelineSpine } from "@/shared/ui/timeline-spine";

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
}: {
  caseId: string;
  caseRow: CaseRecord;
  entities: EntityRecord[];
  identifiers: CaseIdentifierRecord[];
  listsPending?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [
    { data: edges },
    { data: evidence },
    { data: jobs },
    { data: pendingProposals },
  ] = useSuspenseQueries({
    queries: [
      edgesForCaseQuery(caseId),
      evidenceListQuery(caseId),
      jobsListQuery(caseId),
      proposalsByStatusQuery(caseId, "pending"),
    ],
  });

  useLiveEvents(caseId, (event) => {
    if (event.type === "job_update") {
      void invalidateAfterJobMutation(queryClient, caseId);
    }
    if (event.type === "proposal_created") {
      void invalidateAfterProposalQueueChange(queryClient, caseId);
    }
  });

  const liveJobs = useMemo(
    () => jobs.filter((j) => LIVE_STATUSES.has(j.status)),
    [jobs]
  );

  const tiles: StatTile[] = useMemo(
    () => [
      {
        id: "entities",
        label: "Entities",
        value: listsPending ? "—" : entities.length,
        to: "/entities",
      },
      {
        id: "identifiers",
        label: "Identifiers",
        value: listsPending ? "—" : identifiers.length,
        to: "/identifiers",
      },
      {
        id: "connections",
        label: "Connections",
        value: edges.length,
        to: "/graph",
      },
      {
        id: "evidence",
        label: "Evidence",
        value: evidence.length,
        to: "/collect",
      },
      {
        id: "live",
        label: "Live jobs",
        value: liveJobs.length,
        to: "/collect",
      },
      {
        id: "inbox",
        label: "Pending proposals",
        value: pendingProposals.length,
        tone: pendingProposals.length > 0 ? "warn" : undefined,
        to: "/triage",
      },
    ],
    [
      listsPending,
      entities.length,
      identifiers.length,
      edges.length,
      evidence.length,
      liveJobs.length,
      pendingProposals.length,
    ]
  );

  const activity = useMemo(
    () => buildCaseOverviewActivity(evidence, jobs, pendingProposals),
    [evidence, jobs, pendingProposals]
  );

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Case stats"
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,22rem)]">
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
                        {item.kind}
                      </span>
                      <Link
                        to={item.href.to}
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
