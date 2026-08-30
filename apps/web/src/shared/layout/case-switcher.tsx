import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect } from "react";

import { casesContextQuery } from "@/domains/cases/queries";
import { bindCasesChangedInvalidation } from "@/shared/lib/query-invalidation";
import { useSelectActiveCase } from "@/shared/lib/use-select-active-case";
import { SidebarGroupLabel, useSidebar } from "@/shared/ui/shadcn/sidebar";
import { Skeleton } from "@/shared/ui/shadcn/skeleton";

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

function CaseSwitcherReady() {
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
        if (typeof value === "string") return value;
      }
      // oxlint-disable-next-line unicorn/no-useless-undefined -- select must return string | undefined
      return undefined;
    },
  });
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery({
    ...casesContextQuery(),
    meta: { silentError: true },
  });

  useEffect(() => bindCasesChangedInvalidation(queryClient), [queryClient]);

  const cases = data.cases;
  const activeId = data.active?.id ?? "";
  const active = data.active;
  const collapsed = state === "collapsed" && !isMobile;

  const selectMutation = useSelectActiveCase({
    cases,
    pathname,
    entityId,
    navigate,
  });

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

/** Sidebar workspace control — active Case (cookie) + switcher + case nav. */
export function CaseSwitcher() {
  return (
    <Suspense fallback={<CaseSwitcherSkeleton />}>
      <CaseSwitcherReady />
    </Suspense>
  );
}
