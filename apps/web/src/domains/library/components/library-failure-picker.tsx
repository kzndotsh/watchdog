import {
  ToggleGroup,
  ToggleGroupItem,
} from "@watchdog/ui/components/toggle-group";

const NONE = "none";

export type LibraryFailurePickerProps = {
  stepCount: number;
  /** The step picked as failing (0-based), or null for none. */
  failedIndex: number | null;
  onChange: (failedIndex: number | null) => void;
};

/** "What if a step fails?": None, then one toggle per step; picking the same one again clears it. */
export function LibraryFailurePicker({
  stepCount,
  failedIndex,
  onChange,
}: LibraryFailurePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-muted-foreground text-xs">
        What if a step fails?
      </span>
      <ToggleGroup
        aria-label="Step that fails"
        spacing={1}
        value={[failedIndex === null ? NONE : String(failedIndex)]}
        onValueChange={(next: string[]) => {
          const picked = next.find(
            (value) => value !== String(failedIndex ?? NONE)
          );
          const index = Number(picked);
          onChange(
            picked === undefined || picked === NONE || Number.isNaN(index)
              ? null
              : index
          );
        }}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value={NONE}>None</ToggleGroupItem>
        {Array.from({ length: stepCount }, (_, i) => (
          <ToggleGroupItem key={i} value={String(i)}>
            Step {i + 1}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
