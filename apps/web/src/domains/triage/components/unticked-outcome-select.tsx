import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/components/select";
import { cn } from "@/lib/utils";
import {
  CONTROL_TRIGGER,
  resolveSelectValue,
} from "@/shared/ui/control-chrome";
import type { UntickedOpOutcome } from "@watchdog/domain/schemas/jobs";

const OUTCOME_LABELS: Record<UntickedOpOutcome, string> = {
  left: "Leave the rest",
  rejected: "Reject the rest",
};

function isOutcome(value: string): value is UntickedOpOutcome {
  return value in OUTCOME_LABELS;
}

type UntickedOutcomeSelectProps = {
  value: UntickedOpOutcome;
  onChange: (value: UntickedOpOutcome) => void;
  className?: string;
};

/**
 * What a partial Accept does with the unticked changes: leave them (a later run may propose them
 * again) or reject them (they are not proposed again).
 */
export function UntickedOutcomeSelect({
  value,
  onChange,
  className,
}: UntickedOutcomeSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const raw = resolveSelectValue(next);
        if (raw !== null && isOutcome(raw)) onChange(raw);
      }}
    >
      <SelectTrigger
        size="default"
        className={cn(CONTROL_TRIGGER, "w-auto", className)}
        aria-label="Unticked changes"
      >
        <SelectValue>{OUTCOME_LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value="left">{OUTCOME_LABELS.left}</SelectItem>
        <SelectItem value="rejected">{OUTCOME_LABELS.rejected}</SelectItem>
      </SelectContent>
    </Select>
  );
}
