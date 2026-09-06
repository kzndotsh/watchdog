import type { CSSProperties, ReactNode } from "react";

import {
  AppInsetContextMenu,
  SearchChrome,
} from "@/domains/search/components/search-chrome";
import { AppSidebar } from "@/shared/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/shared/ui/shadcn/sidebar";

type SidebarStyle = CSSProperties & { "--sidebar-width"?: string };

const SIDEBAR_STYLE: SidebarStyle = { "--sidebar-width": "13rem" };

/** Dashboard chrome: sidebar + inset. Collapse + theme live in PageHeader / user menu. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider style={SIDEBAR_STYLE} className="h-svh">
      <SearchChrome>
        <a
          href="#app-main"
          className="focus:bg-background focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2 focus:text-sm focus:ring-2"
        >
          Skip to main content
        </a>
        <AppSidebar />
        <SidebarInset className="min-h-0 overflow-hidden">
          <AppInsetContextMenu>{children}</AppInsetContextMenu>
        </SidebarInset>
      </SearchChrome>
    </SidebarProvider>
  );
}
