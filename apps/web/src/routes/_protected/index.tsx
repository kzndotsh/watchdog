import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { casesContextQuery } from "@/domains/cases/queries";
import { DashboardHome } from "@/domains/dashboard/components/dashboard-home";
import { warmDashboardQueries } from "@/domains/dashboard/lib/prefetch-dashboard";
import { RouteError } from "@/shared/layout/route-error";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { optionalUuidSchema } from "@watchdog/schemas";

const routeApi = getRouteApi("/_protected/");

function DashboardPage() {
  const { activityCase } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const onActivityCaseChange = useCallback(
    (next: string | null) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          activityCase: next ?? undefined,
        }),
        replace: true,
      });
    },
    [navigate]
  );
  return (
    <DashboardHome
      activityCaseId={activityCase}
      onActivityCaseChange={onActivityCaseChange}
    />
  );
}

export const Route = createFileRoute("/_protected/")({
  validateSearch: z.object({
    activityCase: optionalUuidSchema,
  }),
  loader: async ({ context: { queryClient } }) => {
    const { active } = await ensureAppQueryData(
      queryClient,
      casesContextQuery()
    );
    warmDashboardQueries(queryClient, active?.id ?? null);
  },
  // Thin loader — shell paints immediately; dashboard regions handle pending/errors inline.
  errorComponent: RouteError,
  component: DashboardPage,
});
