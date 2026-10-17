import type { ReactNode } from "react";

import { RouteCaseContext } from "@/shared/hooks/use-route-case";
import { buildCaseRecord } from "@/testing/records";
import type { CaseRecord } from "@watchdog/core/cases";

/**
 * Test wrapper that stands in for the Case route: a Work screen (and the hooks and links
 * under it) reads its Case from the URL's route context, so render it inside this.
 */
export function RouteCaseProvider({
  routeCase = buildCaseRecord(),
  children,
}: {
  routeCase?: CaseRecord | null;
  children: ReactNode;
}) {
  return <RouteCaseContext value={routeCase}>{children}</RouteCaseContext>;
}
