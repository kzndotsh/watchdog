import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import {
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@watchdog/ui/components/sidebar";

export function CaseSwitcherEmpty({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Create a Case"
            render={<Link to="/cases" />}
          >
            <PlusIcon />
            <span>Create a case…</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <>
      <SidebarGroupLabel>Case</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton render={<Link to="/cases" />}>
            <PlusIcon />
            <span>Create a case…</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}
