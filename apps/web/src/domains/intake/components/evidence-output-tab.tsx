import type { latestEnrichOutput } from "@/domains/intake/lib/evidence";
import { ArtifactContent } from "@/domains/jobs/components/artifact-content";
import { EmptyState } from "@/shared/ui/empty-state";
import { IdChip } from "@/shared/ui/id-chip";
import { ENRICHED_MD_ARTIFACT } from "@watchdog/schemas/jobs";
import { Spinner } from "@watchdog/ui/components/spinner";

type EvidenceOutputTabProps = {
  caseId: string;
  isEnrichRunning: boolean;
  enrichOutput: ReturnType<typeof latestEnrichOutput>;
};

/** The Evidence detail Output tab: the latest Enrich result, or how to get one. */
export function EvidenceOutputTab({
  caseId,
  isEnrichRunning,
  enrichOutput,
}: EvidenceOutputTabProps) {
  if (isEnrichRunning && !enrichOutput) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-6 text-xs">
        <Spinner className="size-3.5" />
        Enrich running — combined markdown appears here when done.
      </div>
    );
  }
  if (enrichOutput) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">
          Combined live + Wayback from Enrich · Job{" "}
          <IdChip value={enrichOutput.job.id} isCopyable />
          {enrichOutput.artifact.name === ENRICHED_MD_ARTIFACT
            ? null
            : ` · fallback ${enrichOutput.artifact.name}`}
        </p>
        <ArtifactContent
          caseId={caseId}
          jobId={enrichOutput.job.id}
          sha256={enrichOutput.artifact.sha256}
          mime={enrichOutput.artifact.mime}
          name={enrichOutput.artifact.name}
        />
      </div>
    );
  }
  return (
    <EmptyState
      size="sm"
      intent="blank-slate"
      items="enrich output"
      title="No Enrich output yet"
      description="Run Enrich to fetch live + Wayback. Result stays on this dump (Output) — not a new Intake row. Then Harvest reads from it."
    />
  );
}
