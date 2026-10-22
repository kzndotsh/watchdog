import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { z } from "zod";

import { Collect } from "@/domains/collect/components/collect";
import { parseCollectRunTarget } from "@/domains/collect/lib/collect-run-target";
import { warmCollectQueries } from "@/domains/collect/lib/prefetch-collect";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

const routeApi = getRouteApi("/_protected/cases/$caseSlug/collect");

function CollectPage() {
  const { id, run } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const handleIdChange = useCallback(
    (next: string | null) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          id: next ?? undefined,
        }),
        replace: true,
      });
    },
    [navigate]
  );
  // `run` is a one-shot link from the Library: Collect opens the Run form on it, then the
  // URL forgets it so a reload or a share does not reopen the form.
  const runTarget = useMemo(() => parseCollectRunTarget(run), [run]);
  const hasRun = run !== undefined;
  useEffect(() => {
    if (!hasRun) return;
    void navigate({
      search: (prev) => ({ ...prev, run: undefined }),
      replace: true,
    });
  }, [hasRun, navigate]);
  return (
    <Collect urlId={id} onIdChange={handleIdChange} runTarget={runTarget} />
  );
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/collect")({
  validateSearch: z.object({
    id: optionalUuidSchema,
    run: z
      .unknown()
      .optional()
      .transform((value) =>
        typeof value === "string" && parseCollectRunTarget(value) !== undefined
          ? value
          : undefined
      ),
  }),
  loaderDeps: ({ search: { id } }) => ({ id }),
  loader: ({ context: { queryClient, workCase }, deps: { id } }) => {
    warmCollectQueries(queryClient, workCase.id, { selectedId: id });
  },
  // Thin loader, like Triage: the shell paints at once and the queue and detail show their
  // skeletons while the lists load (a refresh included).
  component: CollectPage,
});
