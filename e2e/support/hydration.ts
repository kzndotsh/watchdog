import { expect, type Locator, type Page } from "@playwright/test";

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

/**
 * Per-element guard on top of `waitForPageHydrated`: content under a nested
 * lazy or Suspense boundary (dialogs, tab bodies) can still be server markup
 * with no React props after the page frame committed, and a click on it is
 * dropped. Wait until React owns the target before clicking.
 */
export async function clickHydrated(
  target: Locator,
  timeout = 30_000
): Promise<void> {
  await target.waitFor({ timeout });
  await expect
    .poll(
      async () =>
        target.evaluate((el) =>
          Object.keys(el).some((key) => key.startsWith("__reactProps"))
        ),
      { timeout, message: "target was never hydrated by React" }
    )
    .toBe(true);
  await target.click({ timeout });
}
