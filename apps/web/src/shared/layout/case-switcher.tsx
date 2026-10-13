import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { CreateCaseDialog } from "@/domains/cases/components/create-case-dialog";
import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import { useSelectActiveCase } from "@/domains/cases/hooks/use-select-active-case";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { toast } from "@/shared/ui/toast";
import { trimmedOrUndefined } from "@watchdog/schemas/shared";
import { SidebarGroupLabel, useSidebar } from "@watchdog/ui/components/sidebar";
import { Skeleton } from "@watchdog/ui/components/skeleton";

import { CaseSwitcherCollapsed } from "./case-switcher-collapsed";
import { CaseSwitcherEmpty } from "./case-switcher-empty";
import { CaseSwitcherExpanded } from "./case-switcher-expanded";

function CaseSwitcherSkeleton() {
  return (
    <>
      <SidebarGroupLabel>Case</SidebarGroupLabel>
      <Skeleton className="h-8 w-full" />
    </>
  );
}

/** Sidebar workspace control — active Case (cookie) + switcher + case nav. */
export function CaseSwitcher() {
  const { state, isMobile } = useSidebar();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const entityId = useRouterState({
    select: (s): string | undefined => {
      const search: unknown = s.location.search;
      if (
        typeof search === "object" &&
        search !== null &&
        "entityId" in search
      ) {
        const value: unknown = search.entityId;
        if (typeof value === "string") return trimmedOrUndefined(value);
      }
      // oxlint-disable-next-line unicorn/no-useless-undefined -- select must return string | undefined
      return undefined;
    },
  });
  const queryClient = useQueryClient();
  const { cases, active, pending, loadError, retry } = useCasesContext({
    silentError: true,
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const selectMutation = useSelectActiveCase({
    cases,
    pathname,
    entityId,
    navigate,
  });

  if (pending) {
    return <CaseSwitcherSkeleton />;
  }

  if (loadError) {
    return (
      <>
        <SidebarGroupLabel>Case</SidebarGroupLabel>
        <div className="px-2 py-1">
          <FetchErrorAlert error={loadError} onRetry={retry} />
        </div>
      </>
    );
  }

  const activeId = active?.id ?? "";
  const collapsed = state === "collapsed" && !isMobile;

  function selectCase(id: string) {
    if (id === activeId) return;
    selectMutation.mutate(id);
  }

  if (cases.length === 0) {
    return <CaseSwitcherEmpty isCollapsed={collapsed} />;
  }

  const createDialog = (
    <CreateCaseDialog
      open={isCreateOpen}
      onOpenChange={setIsCreateOpen}
      onCreated={() => {
        void invalidateAfterCaseSwitch(queryClient);
        // The new case is now active; a page for the previous case's slug would be stale.
        if (pathname.startsWith("/cases/")) void navigate({ to: "/cases" });
      }}
      onError={(message) => {
        toast.error(message);
      }}
    />
  );
  const openCreate = () => {
    setIsCreateOpen(true);
  };

  if (collapsed) {
    return (
      <>
        <CaseSwitcherCollapsed
          cases={cases}
          active={active}
          activeId={activeId}
          onSelectCase={selectCase}
          onCreate={openCreate}
        />
        {createDialog}
      </>
    );
  }

  return (
    <>
      <CaseSwitcherExpanded
        cases={cases}
        active={active}
        activeId={activeId}
        isCollapsed={collapsed}
        onSelectCase={selectCase}
        onCreate={openCreate}
      />
      {createDialog}
    </>
  );
}
