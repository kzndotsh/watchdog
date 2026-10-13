import { MoreHorizontalIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { AppAction } from "@/shared/lib/app-action";
import { DropdownActionItems } from "@/shared/ui/dropdown-action-items";
import { Button } from "@/shared/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@watchdog/ui/components/dropdown-menu";

type RowActionsMenuProps = {
  label: string;
  /** Skip the hover reveal (e.g. on touch surfaces or short lists). */
  isAlwaysVisible?: boolean;
  className?: string;
  children?: ReactNode;
  actions?: readonly AppAction[];
};

/**
 * Hover-reveal row actions — `MoreHorizontal` + `DropdownMenu`.
 * Prefer `actions`; `children` for call sites not yet on AppAction.
 * Parent row needs `group` for hover reveal.
 */
export function RowActionsMenu({
  label,
  className,
  children,
  actions,
  isAlwaysVisible = false,
}: RowActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className={cn(
              "shrink-0 transition-opacity",
              !isAlwaysVisible &&
                "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              className
            )}
          />
        }
      >
        <MoreHorizontalIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions ? <DropdownActionItems actions={actions} /> : children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
