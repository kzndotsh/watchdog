import { createFileRoute } from "@tanstack/react-router";

import { legacyWorkRedirect } from "@/domains/cases/lib/legacy-work-redirect";

/** Case-less bookmark: redirects to the slugged URL of the Active Case. */
export const Route = createFileRoute("/_protected/triage/")({
  beforeLoad: legacyWorkRedirect("/cases/$caseSlug/triage"),
});
