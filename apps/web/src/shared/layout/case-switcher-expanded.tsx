import { ChevronsUpDownIcon, FolderIcon } from "lucide-react";

import type { CaseRecord } from "@/domains/cases/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@watchdog/ui/components/dropdown-menu";
import {
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@watchdog/ui/components/sidebar";

import { CaseNavLinks } from "./case-nav-links";
import { CasePickerItems } from "./case-picker-items";

type CaseSwitcherExpandedProps = {
  cases: CaseRecord[];
  active: CaseRecord | null | undefined;
  activeId: string;
  collapsed: boolean;
  onSelectCase: (id: string) => void;
  onCreate: () => void;
};

export function CaseSwitcherExpanded({
  cases,
  active,
  activeId,
  collapsed,
  onSelectCase,
  onCreate,
}: CaseSwitcherExpandedProps) {
  return (
    <>
      <SidebarGroupLabel>Case</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  aria-label="Active case"
                  tooltip={active?.name ?? "Case"}
                />
              }
            >
              <FolderIcon />
              <span className="truncate">{active?.name ?? "Select case…"}</span>
              <ChevronsUpDownIcon className="ml-auto" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56"
              side="bottom"
              align="start"
              sideOffset={4}
            >
              <CasePickerItems
                cases={cases}
                activeId={activeId}
                onSelect={onSelectCase}
                onCreate={onCreate}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
        <CaseNavLinks caseSlug={active?.slug} collapsed={collapsed} />
      </SidebarMenu>
    </>
  );
}
