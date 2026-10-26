import { Link } from "@tanstack/react-router";

import { TRIAGE_PENDING_SEARCH } from "@/config/nav";
import { DashedEmpty } from "@/domains/dashboard/components/dashed-empty";
import { proposalTitle } from "@/domains/triage/lib/filters";
import { Button } from "@/shared/ui/primitives/button";
import { RelativeTime } from "@/shared/ui/relative-time";
import { SectionHeaderBar } from "@/shared/ui/section-header-bar";
import type { ProposalRecord } from "@watchdog/core/proposals";

function TriageBody({
  caseSlug,
  proposals,
}: {
  caseSlug: string | null;
  proposals: ProposalRecord[];
}) {
  if (caseSlug === null) {
    return (
      <DashedEmpty>
        Select a Case in the sidebar to see pending proposals.
      </DashedEmpty>
    );
  }
  if (proposals.length === 0) {
    return <DashedEmpty>Triage clear.</DashedEmpty>;
  }
  return (
    <ul className="border-border divide-border divide-y overflow-hidden rounded-md border">
      {proposals.map((p) => {
        const title = proposalTitle(p);
        return (
          <li key={p.id}>
            <Link
              to="/cases/$caseSlug/triage"
              params={{ caseSlug }}
              search={{ ...TRIAGE_PENDING_SEARCH, proposalId: p.id }}
              className="hover:bg-muted/40 flex items-start justify-between gap-3 px-3 py-2.5 text-sm transition-colors"
            >
              <span className="min-w-0">
                <span className="line-clamp-2">{title}</span>
              </span>
              <RelativeTime
                value={p.createdAt}
                className="text-2xs text-muted-foreground shrink-0 font-mono tabular-nums"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardTriageSection({
  caseSlug,
  proposals,
}: {
  caseSlug: string | null;
  proposals: ProposalRecord[];
}) {
  return (
    <section className="space-y-3" aria-label="Recent triage">
      <SectionHeaderBar
        variant="inline"
        title={
          <span className="text-muted-foreground font-normal tracking-wide normal-case">
            Triage
          </span>
        }
        action={
          caseSlug === null ? null : (
            <Button
              variant="link-muted"
              size="inline"
              nativeButton={false}
              render={
                <Link
                  to="/cases/$caseSlug/triage"
                  params={{ caseSlug }}
                  search={
                    proposals[0]
                      ? {
                          ...TRIAGE_PENDING_SEARCH,
                          proposalId: proposals[0].id,
                        }
                      : TRIAGE_PENDING_SEARCH
                  }
                />
              }
            >
              Open
            </Button>
          )
        }
      />

      <TriageBody caseSlug={caseSlug} proposals={proposals} />
    </section>
  );
}
