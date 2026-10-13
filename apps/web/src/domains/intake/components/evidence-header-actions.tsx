import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/with-tooltip";

type EvidenceHeaderActionsProps = {
  isHidden: boolean;
  actions: IntakeEvidenceActions;
  canEnrich: boolean;
  isProcessed: boolean;
  allowThirdPartyEgress?: boolean;
  onHideRequested: () => void;
};

export function EvidenceHeaderActions({
  isHidden,
  actions,
  canEnrich,
  isProcessed,
  allowThirdPartyEgress = false,
  onHideRequested,
}: EvidenceHeaderActionsProps) {
  const {
    isBusy,
    isProcessing,
    isAiProcessing,
    isEnriching,
    onProcess,
    onAiProcess,
    onEnrich,
    onRestore,
  } = actions;

  if (isHidden) {
    return (
      <Button type="button" disabled={isBusy} onClick={onRestore}>
        Restore
      </Button>
    );
  }

  const aiDisabled = isBusy || isProcessed || !allowThirdPartyEgress;

  return (
    <>
      {canEnrich ? (
        <Button
          type="button"
          variant="outline"
          loading={isEnriching}
          disabled={isBusy}
          onClick={onEnrich}
        >
          Enrich
        </Button>
      ) : null}
      <Button
        type="button"
        loading={isProcessing}
        disabled={isBusy || isProcessed}
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
          loading={isAiProcessing}
          disabled={aiDisabled}
          onClick={onAiProcess}
        >
          Extract (AI)
        </Button>
      </WithTooltip>
      <Button
        type="button"
        variant="outline"
        disabled={isBusy}
        onClick={onHideRequested}
      >
        Hide
      </Button>
    </>
  );
}
