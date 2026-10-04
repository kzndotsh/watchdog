import { cn } from "@/lib/utils";
import {
  CONTROL_TRIGGER,
  resolveSelectValue,
} from "@/shared/ui/control-chrome";
import {
  CLAIM_CLASSES,
  trimmedClaimClassSchema,
  type ClaimClass,
  CLAIM_CLASS_LABELS,
} from "@watchdog/schemas/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@watchdog/ui/components/select";

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export function ClaimClassSelect({
  value,
  onChange,
  className,
  id,
  disabled,
}: SelectProps<ClaimClass>) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const raw = resolveSelectValue(next);
        if (raw === null) return;
        onChange(trimmedClaimClassSchema.parse(raw));
      }}
    >
      <SelectTrigger
        id={id}
        size="default"
        className={cn(CONTROL_TRIGGER, "w-auto", className)}
        aria-label="Claim class"
      >
        <SelectValue>{CLAIM_CLASS_LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {CLAIM_CLASSES.map((claimClass) => (
          <SelectItem key={claimClass} value={claimClass}>
            {CLAIM_CLASS_LABELS[claimClass]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
