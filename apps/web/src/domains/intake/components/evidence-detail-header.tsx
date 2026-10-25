import { EvidenceEntityMeta } from "@/domains/intake/components/evidence-entity-meta";
import {
  evidenceTitle,
  type latestEnrichOutput,
} from "@/domains/intake/lib/evidence";
import type { EvidenceRecord } from "@/domains/intake/types";
import { ActorMention } from "@/shared/ui/actor-mention";
import { DetailContextHeader } from "@/shared/ui/detail-context-header";
import { DetailContextSep } from "@/shared/ui/detail-context-sep";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { Button } from "@/shared/ui/primitives/button";
import { TabCount } from "@/shared/ui/tab-count";
import { jobHeadlineLabel } from "@/shared/ui/vocab";
import type { JobListRecord } from "@watchdog/core/jobs";
import { TabsList, TabsTrigger } from "@watchdog/ui/components/tabs";

type EvidenceDetailHeaderProps = {
  evidence: EvidenceRecord;
  isHidden: boolean;
  producingCap: JobListRecord | null;
  entityName?: string | null;
  entities?: readonly EntityOption[];
  canEnrich: boolean;
  enrichJobs: JobListRecord[];
  enrichOutput: ReturnType<typeof latestEnrichOutput>;
  relatedJobs: JobListRecord[];
  isAttaching?: boolean;
  onAttachEntity?: (entityId: string) => void;
  onShowProducingRun?: (jobId: string) => void;
};

export function EvidenceDetailHeader({
  evidence,
  isHidden,
  producingCap,
  entityName,
  entities,
  canEnrich,
  enrichJobs,
  enrichOutput,
  relatedJobs,
  isAttaching = false,
  onAttachEntity,
  onShowProducingRun,
}: EvidenceDetailHeaderProps) {
  const attachedId = evidence.entityId ?? "";

  return (
    <header className="border-border flex shrink-0 flex-col">
      {isHidden ? (
        <p className="text-muted-foreground border-border/60 bg-muted/20 border-b px-4 py-1.5 text-xs">
          Soft-deleted from the active queue. Restore to Harvest, Extract, or
          Enrich again.
        </p>
      ) : null}

      <DetailContextHeader>
        <span className="text-foreground/80 inline-flex min-w-0 items-center gap-1">
          <span className="text-muted-foreground shrink-0">Entity</span>
          <EvidenceEntityMeta
            entityName={entityName}
            attachedId={attachedId}
            entities={entities}
            isAttaching={isAttaching}
            isHidden={isHidden}
            onAttachEntity={onAttachEntity}
          />
        </span>
        {producingCap === null ? null : (
          <>
            <DetailContextSep />
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="shrink-0">From</span>
              <Button
                type="button"
                variant="link"
                size="inline"
                // oxlint-disable-next-line shadcn/no-restyle -- inline text link inside a context line: muted ink; a one-off, not a Button treatment
                className="text-foreground/80 text-xs font-normal underline-offset-2 hover:underline"
                onClick={() => {
                  onShowProducingRun?.(producingCap.id);
                }}
              >
                {jobHeadlineLabel(producingCap)}
              </Button>
            </span>
          </>
        )}
        <DetailContextSep />
        <ActorMention prefix="By" label={evidence.actorLabel} />
      </DetailContextHeader>
      <span className="sr-only">{evidenceTitle(evidence)}</span>

      <div className="border-border border-b px-2 pb-0">
        <TabsList variant="line" className="h-8">
          <TabsTrigger value="content">Content</TabsTrigger>
          {canEnrich || enrichJobs.length > 0 ? (
            <TabsTrigger value="output">
              Output
              {enrichOutput ? <TabCount n={1} /> : null}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="jobs">
            Jobs
            <TabCount n={relatedJobs.length} />
          </TabsTrigger>
          <TabsTrigger value="calls">Calls</TabsTrigger>
        </TabsList>
      </div>
    </header>
  );
}
