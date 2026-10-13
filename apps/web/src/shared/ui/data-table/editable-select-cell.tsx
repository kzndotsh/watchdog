import type { KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import { CONTROL_CELL } from "@/shared/ui/control-chrome";
import { FieldSelect, type FieldSelectOption } from "@/shared/ui/field-select";

export type { FieldSelectOption as EditableSelectOption };

type Props = {
  value: string;
  options: FieldSelectOption[];
  onCommit: (next: string) => void;
  disabled?: boolean;
  className?: string;
  shouldAllowEmpty?: boolean;
  emptyLabel?: string;
  "aria-label"?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
};

/**
 * Dense select cell that commits immediately on pick.
 * Fixed enums use FieldSelect (not Combobox) — no filter empty state.
 */
export function EditableSelectCell({
  value,
  options,
  onCommit,
  disabled = false,
  className,
  shouldAllowEmpty = false,
  emptyLabel = "—",
  "aria-label": ariaLabel,
  onKeyDown,
}: Props) {
  const resolvedOptions =
    shouldAllowEmpty && !options.some((o) => o.value === "")
      ? [{ value: "", label: emptyLabel }, ...options]
      : options;

  return (
    <div className="w-full max-w-full min-w-0">
      <FieldSelect
        value={value}
        onValueChange={(next) => {
          if (next === value) return;
          if (!shouldAllowEmpty && !next) return;
          onCommit(next);
        }}
        options={resolvedOptions}
        disabled={disabled}
        size="sm"
        aria-label={ariaLabel}
        placeholder={shouldAllowEmpty ? emptyLabel : undefined}
        onKeyDown={onKeyDown}
        className={cn(CONTROL_CELL, "w-full max-w-full min-w-0", className)}
      />
    </div>
  );
}
