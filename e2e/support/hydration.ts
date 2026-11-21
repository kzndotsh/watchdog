import type { Page } from "@playwright/test";

/**
 * SSR is off, so anything on screen below the document shell was rendered by React and takes
 * clicks at once; these flags only say how far the client render has got.
 */

/** Root providers mounted (`html[data-hydrated]`). Says nothing about route content. */
export async function waitForHydrated(page: Page): Promise<void> {
  await page.waitForSelector("html[data-hydrated=true]", { timeout: 30_000 });
}

/**
 * Providers mounted AND the route's `Page` frame committed
 * (`html[data-page-hydrated]`, set by `Page` and cleared when it unmounts).
 * Use after navigating to any protected route.
 */
export async function waitForPageHydrated(page: Page): Promise<void> {
  await waitForHydrated(page);
  await page.waitForSelector("html[data-page-hydrated=true]", {
    timeout: 30_000,
  });
}

export async function waitForHydratedNode(
  page: Page,
  selector: string
): Promise<void> {
  await waitForHydrated(page);
  await page.locator(selector).waitFor({ timeout: 30_000 });
}
