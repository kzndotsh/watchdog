import { SearchIcon } from "lucide-react";
import { useContext } from "react";

import { SearchUiContext } from "@/domains/search/hooks/use-search-ui";
import { modKeyLabel } from "@/shared/lib/hotkeys";
import { WithTooltip } from "@/shared/ui/timestamp";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@watchdog/ui/components/sidebar";

/**
 * Global search: an icon button in the sidebar footer next to Settings. Built from the same
 * menu-button metrics as the nav rows, so its icon lines up with the row's chevron above.
 * Opens the command palette (same as the shortcut); renders nothing outside `SearchChrome`.
 */
export function SearchButton() {
  const search = useContext(SearchUiContext);
  if (!search) return null;
  const { openPalette } = search;

  return (
    <SidebarMenu className="w-auto">
      <SidebarMenuItem>
        <WithTooltip
          content={`Search (${modKeyLabel()} K)`}
          side="right"
          wrapSpan
        >
          <SidebarMenuButton
            aria-label="Search"
            className="w-8 justify-center [&_svg]:size-3.5"
            onClick={() => {
              openPalette();
            }}
          >
            <SearchIcon />
          </SidebarMenuButton>
        </WithTooltip>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
