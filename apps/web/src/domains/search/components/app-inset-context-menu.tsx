import type { ReactNode } from "react";

import { useSearchUi } from "@/domains/search/hooks/use-search-ui";
import { ActionsContextMenu } from "@/shared/ui/actions-context-menu";

/** Inset `#app-main` fallback ContextMenu (app chrome only). */
export function AppInsetContextMenu({ children }: { children: ReactNode }) {
  const { chromeActions } = useSearchUi();

  return (
    <ActionsContextMenu
      actions={chromeActions}
      trigger={
        <div id="app-main" className="flex min-h-0 min-w-0 flex-1 flex-col" />
      }
    >
      {children}
    </ActionsContextMenu>
  );
}
