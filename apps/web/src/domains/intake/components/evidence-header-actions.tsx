import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/with-tooltip";

type EvidenceHeaderActionsProps = {
  isHidden: boolean;
  actions: IntakeEvidenceActions;
  canEnrich: boolean;
  processed: boolean;
  allowThirdPartyEgress?: boolean;
  onHideRequested: () => void;
};

export function EvidenceHeaderActions({
  isHidden,
  actions,
  canEnrich,
  processed,
  allowThirdPartyEgress = false,
  onHideRequested,
}: EvidenceHeaderActionsProps) {
  const {
    busy,
    processing,
    aiProcessing,
    enriching,
    onProcess,
    onAiProcess,
    onEnrich,
    onRestore,
  } = actions;

  if (isHidden) {
    return (
      <Button type="button" disabled={busy} onClick={onRestore}>
        Restore
      </Button>
    );
  }

  const aiDisabled = busy || processed || !allowThirdPartyEgress;

  return (
    <>
      {canEnrich ? (
        <Button
          type="button"
          variant="outline"
          loading={enriching}
          disabled={busy}
          onClick={onEnrich}
        >
          Enrich
        </Button>
      ) : null}
      <Button
        type="button"
        loading={processing}
        disabled={busy || processed}
        onClick={onProcess}
      >
        Harvest
      </Button>
      <WithTooltip
        content={
          allowThirdPartyEgress
            ? "LLM extract → Triage Proposal"
            : "Needs Case third-party egress (Cases → edit)."
        }
        shouldWrapSpan={aiDisabled}
      >
        <Button
          type="button"
          variant="outline"
          loading={aiProcessing}
          disabled={aiDisabled}
          onClick={onAiProcess}
        >
          Extract (AI)
        </Button>
      </WithTooltip>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={onHideRequested}
      >
        Hide
      </Button>
    </>
  );
}
