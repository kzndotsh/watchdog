import type { FlagFilter } from "@watchdog/schemas/shared";
import { Switch } from "@watchdog/ui/components/switch";

type FilterFlagControlProps = {
  readonly filter: FlagFilter;
  readonly isOn: boolean;
  readonly onValueChange: (value: boolean) => void;
};

/** A `flag` filter's value: on, or off (absent). Flags are true-only on the wire. */
export function FilterFlagControl({
  filter,
  isOn,
  onValueChange,
}: FilterFlagControlProps) {
  return (
    <label className="flex h-8 min-w-0 items-center gap-2 text-xs">
      <Switch
        checked={isOn}
        aria-label={`${filter.label} only`}
        onCheckedChange={(checked) => {
          onValueChange(checked);
        }}
      />
      <span className="text-muted-foreground">{isOn ? "On" : "Off"}</span>
    </label>
  );
}
