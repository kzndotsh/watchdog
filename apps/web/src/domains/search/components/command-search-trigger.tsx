import { SearchIcon } from "lucide-react";

import { useSearchUi } from "@/domains/search/hooks/use-search-ui";
import { modKeyLabel } from "@/shared/lib/hotkeys";
import { Kbd, KbdGroup } from "@watchdog/ui/components/kbd";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@watchdog/ui/components/sidebar";

export function CommandSearchTrigger() {
  const { openPalette } = useSearchUi();
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const mod = modKeyLabel();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="Search" onClick={openPalette}>
          <SearchIcon />
          {collapsed ? null : (
            <>
              <span className="flex-1 text-left">Search…</span>
              <KbdGroup className="pointer-events-none">
                <Kbd>{mod}</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            </>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
