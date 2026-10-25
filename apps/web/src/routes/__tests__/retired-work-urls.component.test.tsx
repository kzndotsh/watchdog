// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

/** The route id the real route tree finds for `pathname`, or undefined when no route matches. */
function foundRouteId(pathname: string): string | undefined {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  const matched = router.getMatchedRoutes(pathname);
  return matched[2]?.id;
}

describe("Case-less Work URLs no longer exist", () => {
  it.each([
    "/collect",
    "/triage",
    "/tasks",
    "/graph",
    "/identifiers",
    "/entities",
    "/entities/ada-lovelace",
  ])("%s matches no route, so the router's not-found path answers", (href) => {
    expect(foundRouteId(href)).toBeUndefined();
  });

  it("the slugged URLs of the same screens still match", () => {
    expect(foundRouteId("/cases/alpha/collect")).toBe(
      "/_protected/cases/$caseSlug/collect"
    );
    expect(foundRouteId("/cases/alpha/entities/ada-lovelace")).toBe(
      "/_protected/cases/$caseSlug/entities/$entitySlug"
    );
  });
});
