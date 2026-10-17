import { createContext, useContext } from "react";

import type { CaseRecord } from "@watchdog/core/cases";

/**
 * The Case named by the URL (`/cases/$caseSlug/...`), provided by that route's layout.
 * A plain React context rather than a router match, so a screen and its tests need no
 * router to read it. `null` outside a Case route (Dashboard, Cases list, Settings).
 */
export const RouteCaseContext = createContext<CaseRecord | null>(null);

/** The URL's Case, or `null` outside a Case route. */
export function useRouteCase(): CaseRecord | null {
  return useContext(RouteCaseContext);
}

/**
 * The URL's Case for a component that only renders inside a Case route (a Work screen
 * and its parts): its links and navigation name the Case from here, never from the cookie.
 */
export function useWorkCase(): CaseRecord {
  const routeCase = useRouteCase();
  if (routeCase === null) {
    throw new Error(
      "useWorkCase needs a Case route: render under /cases/$caseSlug"
    );
  }
  return routeCase;
}
