import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/primitives/button";
import { SearchField } from "@/shared/ui/search-field";

interface QueueFilterBarProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  "aria-label": string;
  filtersActive?: boolean;
  onReset?: () => void;
  children?: ReactNode;
  className?: string;
}

/**
 * Shared Queue filter row: SearchField + optional facets slot + ghost Reset.
 * Sits in PageToolbar center or directly below PageHeader.
 */
export function QueueFilterBar({
  value,
  onValueChange,
  placeholder,
  "aria-label": ariaLabel,
  filtersActive = false,
  onReset,
  children,
  className,
}: QueueFilterBarProps) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      <SearchField
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      {children}
      {filtersActive && onReset ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={onReset}
        >
          Reset
        </Button>
      ) : null}
    </div>
  );
}
