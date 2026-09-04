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

/** Sentinel — Base UI Select disallows empty-string item values. */
const EMPTY_VALUE = "__wd_empty__";

export interface FieldSelectOption {
  value: string;
  label: string;
}

function toItemValue(value: string): string {
  return value === "" ? EMPTY_VALUE : value;
}

function fromItemValue(value: string): string {
  return value === EMPTY_VALUE ? "" : value;
}

/**
 * Dense string Select — shared CONTROL chrome.
 * Empty-string options/values map through an internal sentinel.
 * Unmatched / empty lists show `placeholder` — never a fake “No …” option.
 */
export function FieldSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  contentClassName,
  id,
  disabled,
  size = "default",
  "aria-label": ariaLabel,
  onKeyDown,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly FieldSelectOption[];
  placeholder?: string;
  className?: string;
  /** Popup width/layout — defaults to match trigger (`w-(--anchor-width)`). */
  contentClassName?: string;
  id?: string;
  disabled?: boolean;
  /** `sm` = h-7 (table cells); `default` = h-8 (standalone fields). */
  size?: "sm" | "default";
  "aria-label"?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
}) {
  const matched = options.find((opt) => opt.value === value);
  const selectValue = matched === undefined ? null : toItemValue(value);

  return (
    <Select
      value={selectValue}
      disabled={disabled}
      onValueChange={(next) => {
        const raw = resolveSelectValue(next);
        if (raw === null) return;
        onValueChange(fromItemValue(raw));
      }}
    >
      <SelectTrigger
        id={id}
        size={size}
        className={cn(CONTROL_TRIGGER, "min-w-0", className)}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
      >
        <SelectValue placeholder={placeholder}>
          {matched ? (
            <span className="block min-w-0 truncate">{matched.label}</span>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        side="bottom"
        alignItemWithTrigger={false}
        className={contentClassName}
      >
        {options.map((opt) => {
          const itemValue = toItemValue(opt.value);
          return (
            <SelectItem key={itemValue} value={itemValue}>
              {opt.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
