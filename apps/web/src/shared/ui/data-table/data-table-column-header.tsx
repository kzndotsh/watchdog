import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** The sorting surface of a column in either feature set (client or server mode). */
export type SortableColumn = {
  getCanSort: () => boolean;
  getIsSorted: () => false | "asc" | "desc";
  toggleSorting: (desc?: boolean) => void;
};

type Props = {
  column: SortableColumn;
  title: string;
  className?: string;
};

function SortGlyph({ sorted }: { sorted: false | "asc" | "desc" }) {
  switch (sorted) {
    case "asc": {
      return <ArrowUpIcon className="size-3 shrink-0" aria-hidden />;
    }
    case "desc": {
      return <ArrowDownIcon className="size-3 shrink-0" aria-hidden />;
    }
    case false: {
      return (
        <ChevronsUpDownIcon
          className="size-3 shrink-0 opacity-40 group-hover/col-header:opacity-70"
          aria-hidden
        />
      );
    }
    default: {
      const _exhaustive: never = sorted;
      return _exhaustive;
    }
  }
}

export function DataTableColumnHeader({ column, title, className }: Props) {
  if (!column.getCanSort()) {
    return (
      <span className={cn("text-sm font-medium", className)}>{title}</span>
    );
  }

  const sorted = column.getIsSorted();

  return (
    <button
      type="button"
      className={cn(
        "group/col-header inline-flex h-7 max-w-full items-center gap-1 text-sm font-medium",
        "focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-2",
        sorted
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
      onClick={() => {
        column.toggleSorting(sorted === "asc");
      }}
    >
      <span className="truncate">{title}</span>
      <SortGlyph sorted={sorted} />
    </button>
  );
}
