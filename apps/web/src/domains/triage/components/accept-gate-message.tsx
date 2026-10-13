import { FormInlineWarning } from "@/shared/ui/form-inline-message";
import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";

export function AcceptGateMessage({
  isConfirmedWithoutBundle,
  shouldWarnZeroEvidence,
}: {
  isConfirmedWithoutBundle: boolean;
  shouldWarnZeroEvidence: boolean;
}) {
  return (
    <>
      {isConfirmedWithoutBundle ? (
        <FormInlineWarning>{CONFIRMED_REQUIRES_EVIDENCE}</FormInlineWarning>
      ) : null}
      {shouldWarnZeroEvidence ? (
        <p className="text-muted-foreground text-xs">
          No evidence selected — Accept will still apply, but cites will be
          empty unless Job evidence is attached.
        </p>
      ) : null}
    </>
  );
}
