import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageToolbarProps = {
  leading?: ReactNode;
  center?: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

/**
 * Page toolbar strip below PageHeader.
 *
 * Slots:
 * - leading: optional mode swapper
 * - center: search + filter menu (chips appear when filters are set)
 * - trailing: view options, column toggles
 */
export function PageToolbar({
  leading,
  center,
  trailing,
  className,
}: PageToolbarProps) {
  return (
    <div
      className={cn(
        // min-h-8 matches CONTROL_HEIGHT (SearchField / Select / EntityCombobox)
        "flex min-h-8 shrink-0 flex-wrap items-center gap-2",
        className
      )}
    >
      {leading ? (
        <div className="flex flex-wrap items-center gap-2">{leading}</div>
      ) : null}
      {center ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {center}
        </div>
      ) : null}
      {trailing ? (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
