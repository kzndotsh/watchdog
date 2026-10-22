import {
  ArchiveIcon,
  BugIcon,
  FileSearchIcon,
  FolderIcon,
  LayoutGridIcon,
  NetworkIcon,
  PanelsTopLeftIcon,
  ShieldAlertIcon,
  UserRoundIcon,
  WorkflowIcon,
} from "lucide-react";

import type { LibraryCategory } from "@/domains/library/lib/library-entries";
import {
  LIBRARY_RAIL_LIST_CLASS,
  LIBRARY_RAIL_NAV_CLASS,
} from "@/shared/ui/library-shell";
import {
  SidebarGroupLabel,
  SidebarMenuButton,
} from "@watchdog/ui/components/sidebar";

/** Key of the total in `LibraryCategoryRailProps.counts`. */
export const ALL_CATEGORIES = "all";

export type LibraryCategoryRailProps = {
  categories: readonly LibraryCategory[];
  /** Entries per category under the current filters; `ALL_CATEGORIES` is the total. */
  counts: ReadonlyMap<string, number>;
  /** The selected category id, or null for All. */
  selected: string | null;
  onSelect: (category: string | null) => void;
};

/** A category's icon; a plain folder for any category without one. */
function CategoryIcon({ category }: { category: string }) {
  switch (category) {
    case ALL_CATEGORIES: {
      return <LayoutGridIcon aria-hidden />;
    }
    case "playbook": {
      return <WorkflowIcon aria-hidden />;
    }
    case "archive": {
      return <ArchiveIcon aria-hidden />;
    }
    case "breach": {
      return <ShieldAlertIcon aria-hidden />;
    }
    case "evidence": {
      return <FileSearchIcon aria-hidden />;
    }
    case "identity": {
      return <UserRoundIcon aria-hidden />;
    }
    case "network": {
      return <NetworkIcon aria-hidden />;
    }
    case "threat": {
      return <BugIcon aria-hidden />;
    }
    case "web": {
      return <PanelsTopLeftIcon aria-hidden />;
    }
    default: {
      return <FolderIcon aria-hidden />;
    }
  }
}

type RailItemProps = {
  id: string;
  label: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
};

function RailItem({ id, label, count, isSelected, onClick }: RailItemProps) {
  return (
    <li className="shrink-0 lg:block">
      <SidebarMenuButton
        isActive={isSelected}
        aria-current={isSelected ? "true" : undefined}
        onClick={onClick}
      >
        <CategoryIcon category={id} />
        <span className="truncate">{label}</span>
        <span className="text-muted-foreground ml-auto pl-2 tabular-nums">
          {count}
        </span>
      </SidebarMenuButton>
    </li>
  );
}

/**
 * Categories in the Settings-style nav beside the content (a row of pills at phone width). The
 * counts follow the other filters, so the rail and the filters read as one.
 */
export function LibraryCategoryRail({
  categories,
  counts,
  selected,
  onSelect,
}: LibraryCategoryRailProps) {
  return (
    <nav aria-label="Library categories" className={LIBRARY_RAIL_NAV_CLASS}>
      <ul className={LIBRARY_RAIL_LIST_CLASS}>
        <li aria-hidden className="hidden lg:block">
          <SidebarGroupLabel>Categories</SidebarGroupLabel>
        </li>
        <RailItem
          id={ALL_CATEGORIES}
          label="All"
          count={counts.get(ALL_CATEGORIES) ?? 0}
          isSelected={selected === null}
          onClick={() => {
            onSelect(null);
          }}
        />
        {categories.map((category) => (
          <RailItem
            key={category.id}
            id={category.id}
            label={category.label}
            count={counts.get(category.id) ?? 0}
            isSelected={selected === category.id}
            onClick={() => {
              onSelect(category.id);
            }}
          />
        ))}
      </ul>
    </nav>
  );
}
