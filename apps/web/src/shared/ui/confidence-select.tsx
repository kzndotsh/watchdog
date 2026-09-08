import { cn } from "@/lib/utils";
import {
  CONTROL_TRIGGER,
  resolveSelectValue,
} from "@/shared/ui/control-chrome";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/shadcn/select";
import { CONFIDENCE_LABELS } from "@/shared/ui/vocab";
import {
  CONFIDENCE_TIERS,
  trimmedConfidenceTierSchema,
  type ConfidenceTier,
} from "@watchdog/schemas";

interface SelectProps {
  value: ConfidenceTier;
  onChange: (value: ConfidenceTier) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
}

/** Confidence picker — same CONTROL chrome as FieldSelect. */
export function ConfidenceSelect({
  value,
  onChange,
  className,
  id,
  disabled,
}: SelectProps) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const raw = resolveSelectValue(next);
        if (raw === null) return;
        onChange(trimmedConfidenceTierSchema.parse(raw));
      }}
    >
      <SelectTrigger
        id={id}
        size="default"
        className={cn(CONTROL_TRIGGER, "w-auto", className)}
        aria-label="Confidence"
      >
        <SelectValue>{CONFIDENCE_LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {CONFIDENCE_TIERS.map((tier) => (
          <SelectItem key={tier} value={tier}>
            {CONFIDENCE_LABELS[tier]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
