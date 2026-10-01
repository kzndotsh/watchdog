import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { CreateCaseDialog } from "@/domains/cases/components/create-case-dialog";
import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import {
  bindCasesChangedInvalidation,
  invalidateAfterCaseSwitch,
} from "@/shared/lib/query-invalidation";
import { useSelectActiveCase } from "@/shared/lib/use-select-active-case";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { toast } from "@/shared/ui/toast";
import { trimmedOrUndefined } from "@watchdog/schemas";
import { SidebarGroupLabel, useSidebar } from "@watchdog/ui/components/sidebar";
import { Skeleton } from "@watchdog/ui/components/skeleton";

import {
  CaseSwitcherCollapsed,
  CaseSwitcherEmpty,
  CaseSwitcherExpanded,
} from "./case-switcher-views";

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

  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => bindCasesChangedInvalidation(queryClient), [queryClient]);

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
    return <CaseSwitcherEmpty collapsed={collapsed} />;
  }

  const createDialog = (
    <CreateCaseDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
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
    setCreateOpen(true);
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
        collapsed={collapsed}
        onSelectCase={selectCase}
        onCreate={openCreate}
      />
      {createDialog}
    </>
  );
}
