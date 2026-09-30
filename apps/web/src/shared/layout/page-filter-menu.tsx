import { FilterIcon, XIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { CHIP_SIZE_CLASS } from "@/shared/ui/detail-status-chip";
import { Button } from "@/shared/ui/primitives/button";
import { Badge } from "@watchdog/ui/components/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";

export interface PageFilterChip {
  id: string;
  label: string;
  onClear: () => void;
}

export function PageFilterMenu({
  chips,
  onClearAll,
  children,
  contentClassName,
  align = "start",
  icon: Icon = FilterIcon,
  label = "Filters",
}: {
  chips: PageFilterChip[];
  onClearAll?: () => void;
  children: ReactNode;
  contentClassName?: string;
  align?: "start" | "center" | "end";
  /** Trigger icon — default funnel; override when two filter menus share a toolbar. */
  icon?: LucideIcon;
  /** Base aria-label (active count is appended when chips exist). */
  label?: string;
}) {
  const active = chips.length > 0;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Popover>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              aria-label={active ? `${label}, ${chips.length} active` : label}
            />
          }
        >
          <Icon className="size-4" />
        </PopoverTrigger>
        <PopoverContent
          align={align}
          className={cn("w-[16rem] space-y-3", contentClassName)}
        >
          {children}
          {active && onClearAll ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full"
              onClick={onClearAll}
            >
              Clear filters
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
      {chips.map((chip) => (
        <Badge
          key={chip.id}
          variant="secondary"
          className={cn(CHIP_SIZE_CLASS.sm, "text-foreground/80 gap-1 pr-1")}
        >
          {chip.label}
          <button
            type="button"
            className="hover:bg-muted rounded-sm p-0.5"
            aria-label={`Remove ${chip.label}`}
            onClick={() => {
              chip.onClear();
            }}
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
