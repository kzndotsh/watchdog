import {
  ToggleGroup,
  ToggleGroupItem,
} from "@watchdog/ui/components/toggle-group";

const RUN_MODES = [
  { value: "cap", label: "Cap" },
  { value: "playbook", label: "Playbook" },
] as const;

export type CollectRunMode = (typeof RUN_MODES)[number]["value"];

function isRunMode(value: string | undefined): value is CollectRunMode {
  return RUN_MODES.some((mode) => mode.value === value);
}

export function CollectRunModeToggle({
  value,
  onValueChange,
}: {
  value: CollectRunMode;
  onValueChange: (next: CollectRunMode) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Run mode"
      spacing={1}
      value={[value]}
      onValueChange={(next: string[]) => {
        const mode = next[0];
        if (isRunMode(mode)) onValueChange(mode);
      }}
      variant="outline"
    >
      {RUN_MODES.map((mode) => (
        <ToggleGroupItem key={mode.value} value={mode.value}>
          {mode.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
