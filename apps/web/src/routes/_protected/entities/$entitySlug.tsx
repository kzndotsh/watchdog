import { createFileRoute, redirect } from "@tanstack/react-router";

import { legacyWorkCaseSlug } from "@/domains/cases/lib/legacy-work-redirect";

/** Case-less Dossier bookmark: redirects to the slugged URL of the Active Case. */
export const Route = createFileRoute("/_protected/entities/$entitySlug")({
  beforeLoad: async ({ context: { queryClient }, params }) => {
    const caseSlug = await legacyWorkCaseSlug(queryClient);
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() throws
    throw redirect({
      to: "/cases/$caseSlug/entities/$entitySlug",
      params: { caseSlug, entitySlug: params.entitySlug },
      search: true,
      replace: true,
    });
  },
});
