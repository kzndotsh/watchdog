import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { clickHydrated, waitForPageHydrated } from "../../support/hydration";
import { primaryRoutes } from "../../support/navigation-routes";
import { recordGateRequests } from "../../support/request-counts";

/** The session is cached for 60 s (`STALE_SESSION`); one refresh per elapsed minute is the budget. */
const SESSION_REFRESH_MS = 60_000;

/** Sidebar links to screens that read no Better Auth data of their own (Settings and Cases do). */
const SIDEBAR_TOUR = [
  { label: "Tasks", path: "/tasks" },
  { label: "Collect", path: "/collect" },
  { label: "Triage", path: "/triage" },
  { label: "Entities", path: "/entities" },
  { label: "Identifiers", path: "/identifiers" },
  { label: "Graph", path: "/graph" },
  { label: "Tasks", path: "/tasks" },
  { label: "Collect", path: "/collect" },
] as const;

const HOVER_ONLY = ["Triage", "Entities", "Identifiers"] as const;

function sidebarLink(page: Page, label: string) {
  return page.getByRole("link", { name: label, exact: true }).first();
}

/** Hover (the guard runs as an intent preload), click, and wait for the screen. */
async function visit(
  page: Page,
  stop: (typeof SIDEBAR_TOUR)[number]
): Promise<void> {
  const link = sidebarLink(page, stop.label);
  await link.hover();
  await clickHydrated(link);
  await expect(page).toHaveURL(new RegExp(`${stop.path}$`));
  await waitForPageHydrated(page);
  await primaryRoutes.find((route) => route.path === stop.path)?.ready(page);
}

/** The steps are order-dependent browser actions: run them one after another. */
async function inSequence<T>(
  items: readonly T[],
  step: (item: T) => Promise<void>
): Promise<void> {
  for (const item of items) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each step navigates the one page the next step starts from
    await step(item);
  }
}

test.describe("Route guard requests", () => {
  test(
    "sidebar navigations on a warm session make no auth or organization-state request",
    { tag: "@smoke" },
    async ({ authenticatedCase: _authenticatedCase, page }) => {
      // The page load seeds the session and organization state (server side, in process).
      const startedAt = Date.now();
      await page.goto("/");
      await waitForPageHydrated(page);
      await primaryRoutes.find((route) => route.path === "/")?.ready(page);

      const recorded = recordGateRequests(page);

      await inSequence(SIDEBAR_TOUR, async (stop) => visit(page, stop));
      // Hover only, no click: preloads of other screens.
      await inSequence(HOVER_ONLY, async (label) =>
        sidebarLink(page, label).hover()
      );

      recorded.stop();
      const allowedRefreshes = Math.floor(
        (Date.now() - startedAt) / SESSION_REFRESH_MS
      );
      expect(
        recorded.urls.length,
        `at most ${allowedRefreshes} session refresh(es) in this run, got: ${recorded.urls.join(", ")}`
      ).toBeLessThanOrEqual(allowedRefreshes);
    }
  );
});
