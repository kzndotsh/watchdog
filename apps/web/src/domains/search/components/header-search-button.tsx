import { SearchIcon } from "lucide-react";
import { useContext } from "react";

import { SearchUiContext } from "@/domains/search/hooks/use-search-ui";
import { modKeyLabel } from "@/shared/lib/hotkeys";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/timestamp";

/**
 * Global search: an icon button at the end of every page header, so it fits whatever
 * actions the page puts up there. Opens the command palette (same as the shortcut).
 * Renders nothing outside `SearchChrome` (tests, auth screens).
 */
export function HeaderSearchButton() {
  const search = useContext(SearchUiContext);
  if (!search) return null;
  const { openPalette } = search;

  return (
    <WithTooltip content={`Search (${modKeyLabel()} K)`} side="bottom">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Search"
        className="shrink-0"
        onClick={() => {
          openPalette();
        }}
      >
        <SearchIcon />
      </Button>
    </WithTooltip>
  );
}
