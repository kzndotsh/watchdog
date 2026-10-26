import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/primitives/button";

type ClaimComposerActionsProps = {
  submitLabel: string;
  isSubmitDisabled: boolean;
  submitTitle?: string;
  className?: string;
  onCancel: () => void;
};

/** Shared Cancel + submit footer for every claim form (composer, row edit, action). */
export function ClaimComposerActions({
  submitLabel,
  isSubmitDisabled,
  submitTitle,
  className,
  onCancel,
}: ClaimComposerActionsProps) {
  return (
    <div className={cn("flex gap-1", className)}>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        type="submit"
        size="sm"
        disabled={isSubmitDisabled}
        title={submitTitle}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
