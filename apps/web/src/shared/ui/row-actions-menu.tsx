import { MoreHorizontalIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { AppAction } from "@/shared/lib/app-action";
import { DropdownActionItems } from "@/shared/ui/action-list";
import { Button } from "@/shared/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/ui/shadcn/dropdown-menu";

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
}: {
  label: string;
  className?: string;
  children?: ReactNode;
  actions?: readonly AppAction[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={label}
            className={cn(
              "h-6 w-6 shrink-0 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
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
