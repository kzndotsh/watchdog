import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import { CONTROL_CELL_SHELL } from "@/shared/ui/control-chrome";
import type { FieldSelectOption } from "@/shared/ui/field-select";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/shared/ui/shadcn/combobox";

export type EditableSuggestOption = FieldSelectOption;

function optionFor(
  options: readonly EditableSuggestOption[],
  raw: string
): EditableSuggestOption | null {
  if (!raw) return null;
  return options.find((o) => o.value === raw) ?? { value: raw, label: raw };
}

function resolveTyped(
  options: readonly EditableSuggestOption[],
  raw: string
): string {
  const t = raw.trim();
  if (!t) return "";
  const byLabel = options.find(
    (o) => o.label.toLowerCase() === t.toLowerCase()
  );
  if (byLabel) return byLabel.value;
  return t;
}

/**
 * Free-type cell with filterable suggestions (replaces HTML datalist).
 * Commits on pick, blur, or Enter — custom values allowed.
 * Selection is uncontrolled so a pick is not snapped back to the stale prop.
 */
export function EditableSuggestCell({
  value,
  options,
  onCommit,
  disabled = false,
  className,
  placeholder,
  emptyText = "No matches.",
  "aria-label": ariaLabel,
  onKeyDown: externalKeyDown,
}: {
  value: string;
  options: readonly EditableSuggestOption[];
  onCommit: (next: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  emptyText?: string;
  "aria-label"?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const skipBlurCommit = useRef(false);
  const items = useMemo(() => {
    const next = [...options];
    if (value && !next.some((o) => o.value === value)) {
      next.unshift({ value, label: value });
    }
    return next;
  }, [options, value]);

  const [inputValue, setInputValue] = useState(
    () => optionFor(items, value)?.label ?? value
  );
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setInputValue(optionFor(items, value)?.label ?? value);
  }

  function commitRaw(raw: string) {
    if (disabled) return;
    const next = resolveTyped(options, raw);
    if (next === value) return;
    onCommit(next);
  }

  return (
    <div className="w-full max-w-full min-w-0">
      <Combobox
        inputValue={inputValue}
        onInputValueChange={setInputValue}
        items={items}
        itemToStringLabel={(opt: EditableSuggestOption) => opt.label}
        isItemEqualToValue={(a, b) => a.value === b.value}
        disabled={disabled}
        onValueChange={(next: EditableSuggestOption | null, details) => {
          if (details.reason === "escape-key") {
            details.allowPropagation();
          }
          if (!next) return;
          skipBlurCommit.current = true;
          setInputValue(next.label);
          if (next.value !== value) onCommit(next.value);
        }}
      >
        <ComboboxInput
          showTrigger
          aria-label={ariaLabel}
          placeholder={placeholder}
          autoComplete="off"
          data-1p-ignore=""
          data-lpignore="true"
          data-form-type="other"
          className={cn(
            CONTROL_CELL_SHELL,
            "w-full max-w-full min-w-0",
            className
          )}
          onBlur={() => {
            if (skipBlurCommit.current) {
              skipBlurCommit.current = false;
              return;
            }
            commitRaw(inputValue);
          }}
          onKeyDown={(e) => {
            externalKeyDown?.(e);
            if (e.key === "Escape") {
              e.preventDefault();
              skipBlurCommit.current = false;
              setInputValue(optionFor(items, value)?.label ?? value);
              e.currentTarget.blur();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitRaw(inputValue);
              e.currentTarget.blur();
            }
          }}
        />
        <ComboboxContent>
          <ComboboxEmpty>{emptyText}</ComboboxEmpty>
          <ComboboxList>
            {(opt: EditableSuggestOption) => (
              <ComboboxItem key={opt.value} value={opt}>
                {opt.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
