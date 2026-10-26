import { cn } from "@/lib/utils";
import { CONTROL_TRIGGER } from "@/shared/ui/control-chrome";
import type { ChoicesFilter } from "@watchdog/schemas/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@watchdog/ui/components/select";

type FilterChoicesControlProps = {
  readonly filter: ChoicesFilter;
  readonly value: readonly string[];
  readonly onValueChange: (value: readonly string[]) => void;
};

/** A `choices` filter's value: any of its vocabulary, one multi-select ("url, file"). */
export function FilterChoicesControl({
  filter,
  value,
  onValueChange,
}: FilterChoicesControlProps) {
  const labels: Readonly<Record<string, string>> = filter.optionLabels;
  const text = value.map((item) => labels[item] ?? item).join(", ");
  return (
    <Select
      multiple
      value={[...value]}
      onValueChange={(next) => {
        onValueChange(Array.isArray(next) ? next.map(String) : []);
      }}
    >
      <SelectTrigger
        aria-label={`${filter.label} values`}
        className={cn(
          CONTROL_TRIGGER,
          "w-full min-w-0 overflow-hidden data-[size=default]:h-8"
        )}
      >
        <SelectValue placeholder="Any">
          {text === "" ? null : (
            <span className="block min-w-0 truncate">{text}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {filter.values.map((option) => (
          <SelectItem key={option} value={option}>
            {labels[option] ?? option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
