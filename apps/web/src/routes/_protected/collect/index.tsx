import { createFileRoute, redirect } from "@tanstack/react-router";

import { legacyWorkCaseSlug } from "@/domains/cases/lib/legacy-work-redirect";

/** Case-less bookmark: redirects to the slugged URL of the Active Case. */
export const Route = createFileRoute("/_protected/collect/")({
  beforeLoad: async ({ context: { queryClient } }) => {
    const caseSlug = await legacyWorkCaseSlug(queryClient);
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() throws
    throw redirect({
      to: "/cases/$caseSlug/collect",
      params: { caseSlug },
      search: true,
      replace: true,
    });
  },
});
