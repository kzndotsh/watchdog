import { CONFIRMED_REQUIRES_EVIDENCE } from "@/domains/dossier/lib/confirmed-evidence";
import { FormInlineWarning } from "@/shared/ui/form-inline-message";

export function AcceptGateMessage({
  confirmedWithoutBundle,
  zeroEvidenceWarn,
}: {
  confirmedWithoutBundle: boolean;
  zeroEvidenceWarn: boolean;
}) {
  return (
    <>
      {confirmedWithoutBundle ? (
        <FormInlineWarning>{CONFIRMED_REQUIRES_EVIDENCE}</FormInlineWarning>
      ) : null}
      {zeroEvidenceWarn ? (
        <p className="text-muted-foreground text-xs">
          No evidence selected — Accept will still apply, but cites will be
          empty unless Job evidence is attached.
        </p>
      ) : null}
    </>
  );
}
