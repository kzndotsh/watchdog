import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import {
  DEFAULT_ALLOWED_EGRESS,
  allowsEgressClass,
} from "@watchdog/schemas/caps";
import type { EgressClass } from "@watchdog/schemas/shared";

type EvidenceHeaderActionsProps = {
  isHidden: boolean;
  actions: IntakeEvidenceActions;
  canEnrich: boolean;
  isProcessed: boolean;
  allowedEgress?: readonly EgressClass[];
  onHideRequested: () => void;
};

export function EvidenceHeaderActions({
  isHidden,
  actions,
  canEnrich,
  isProcessed,
  allowedEgress = DEFAULT_ALLOWED_EGRESS,
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

  const canUseModel = allowsEgressClass(allowedEgress, "model");
  const aiDisabled = isBusy || isProcessed || !canUseModel;

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
          canUseModel
            ? "LLM extract → Triage Proposal"
            : "Needs the Case to allow the AI model (owner or admin, in Case settings)."
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
