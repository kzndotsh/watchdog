import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import { bindCasesChangedInvalidation } from "@/shared/lib/query-invalidation";
import { useSelectActiveCase } from "@/shared/lib/use-select-active-case";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { SidebarGroupLabel, useSidebar } from "@/shared/ui/shadcn/sidebar";
import { Skeleton } from "@/shared/ui/shadcn/skeleton";
import { trimmedOrUndefined } from "@watchdog/schemas";

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

  if (collapsed) {
    return (
      <CaseSwitcherCollapsed
        cases={cases}
        active={active}
        activeId={activeId}
        onSelectCase={selectCase}
      />
    );
  }

  return (
    <CaseSwitcherExpanded
      cases={cases}
      active={active}
      activeId={activeId}
      collapsed={collapsed}
      onSelectCase={selectCase}
    />
  );
}
