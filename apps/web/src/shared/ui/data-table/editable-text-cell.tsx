import { forwardRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { CONTROL_CELL } from "@/shared/ui/control-chrome";
import { Input } from "@/shared/ui/shadcn/input";

interface Props {
  value: string;
  /** Return `false` to reject and revert. */
  // oxlint-disable-next-line typescript/no-invalid-void-type -- callers commonly pass a void-returning setter for "accept"; `boolean | undefined` would break every such call site
  onCommit: (next: string) => boolean | void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url";
  sanitize?: (next: string) => string;
  "aria-label"?: string;
  mono?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Leading control inside the field chrome (e.g. entity kind glyph). */
  prefix?: ReactNode;
  /** Trailing control beside the input (e.g. copy) — outside field chrome. */
  suffix?: ReactNode;
}

/**
 * Notion/Airtable-style text cell.
 * Local draft — commits on blur/Enter, reverts on Escape.
 * Shares CONTROL_CELL chrome with EditableSelectCell / EntityCombobox cell.
 */
export const EditableTextCell = forwardRef<HTMLInputElement, Props>(
  (
    {
      value,
      onCommit,
      disabled = false,
      className,
      placeholder,
      type = "text",
      sanitize,
      "aria-label": ariaLabel,
      mono = false,
      autoFocus = false,
      onKeyDown: externalKeyDown,
      prefix,
      suffix,
    },
    ref
  ) => {
    const [draft, setDraft] = useState(value);
    // Reset the local draft whenever the committed value changes underneath
    // us (e.g. another cell saved, or the row was refetched).
    const [prevValue, setPrevValue] = useState(value);
    if (value !== prevValue) {
      setPrevValue(value);
      setDraft(value);
    }

    function commit() {
      if (disabled || draft === value) return;
      if (onCommit(draft) === false) setDraft(value);
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      externalKeyDown?.(e);
      if (e.key === "Escape") {
        e.preventDefault();
        setDraft(value);
        e.currentTarget.blur();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commit();
        e.currentTarget.blur();
      }
    }

    const sharedInputProps = {
      ref,
      type,
      value: draft,
      autoFocus,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = sanitize ? sanitize(e.target.value) : e.target.value;
        setDraft(next);
      },
      onBlur: commit,
      onKeyDown: handleKeyDown,
      disabled,
      placeholder,
      "aria-label": ariaLabel,
      autoComplete: "off" as const,
      "data-1p-ignore": true,
      "data-lpignore": "true",
      "data-form-type": "other",
    };

    if (prefix) {
      return (
        <span
          className={cn(
            "group inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 py-0 shadow-none",
            "hover:bg-muted/40 focus-within:border-ring focus-within:bg-background",
            className
          )}
        >
          {prefix}
          <input
            {...sharedInputProps}
            className={cn(
              "text-foreground placeholder:text-muted-foreground h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-xs outline-none focus:outline-none focus-visible:outline-none",
              mono && "font-mono"
            )}
          />
          {suffix}
        </span>
      );
    }

    const input = (
      <Input
        {...sharedInputProps}
        className={cn(
          CONTROL_CELL,
          "px-1.5 text-xs focus-visible:ring-0",
          suffix && "pr-7",
          mono && "font-mono",
          className
        )}
      />
    );

    if (!suffix) return input;

    return (
      <span className="group relative inline-flex w-full min-w-0 items-center">
        <span className="min-w-0 flex-1">{input}</span>
        <span className="pointer-events-none absolute top-1/2 right-0.5 z-10 -translate-y-1/2 group-focus-within:pointer-events-auto group-hover:pointer-events-auto [&:has(:focus-visible)]:pointer-events-auto">
          {suffix}
        </span>
      </span>
    );
  }
);
EditableTextCell.displayName = "EditableTextCell";
