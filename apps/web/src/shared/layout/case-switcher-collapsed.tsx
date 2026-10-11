import { Link } from "@tanstack/react-router";
import { FolderIcon, LayoutDashboardIcon } from "lucide-react";

import { CASE_NAV_ITEMS } from "@/config/nav";
import type { CaseRecord } from "@/domains/cases/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@watchdog/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@watchdog/ui/components/sidebar";

import { CasePickerItems } from "./case-picker-items";

export function CaseSwitcherCollapsed({
  cases,
  active,
  activeId,
  onSelectCase,
  onCreate,
}: {
  cases: CaseRecord[];
  active: CaseRecord | null | undefined;
  activeId: string;
  onSelectCase: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton tooltip={active?.name ?? "Case"} />}
          >
            <FolderIcon />
            <span>{active?.name ?? "Case"}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-48"
            side="right"
            align="end"
            sideOffset={8}
          >
            <CasePickerItems
              cases={cases}
              activeId={activeId}
              onSelect={onSelectCase}
              onCreate={onCreate}
            />
            {active ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  render={
                    <Link
                      to="/cases/$caseSlug"
                      params={{ caseSlug: active.slug }}
                    />
                  }
                >
                  <LayoutDashboardIcon />
                  Overview
                </DropdownMenuItem>
                {CASE_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.to}
                      render={<Link to={item.to} />}
                    >
                      <Icon />
                      {item.label}
                    </DropdownMenuItem>
                  );
                })}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
