import { expect, type Locator, type Page } from "@playwright/test";

export async function waitForHydrated(page: Page): Promise<void> {
  await page.waitForSelector("html[data-hydrated=true]", { timeout: 30_000 });
}

export async function waitForHydratedNode(
  page: Page,
  selector: string
): Promise<void> {
  await waitForHydrated(page);
  await page.locator(selector).waitFor({ timeout: 30_000 });
}

/**
 * `html[data-hydrated]` is set when the root providers mount, but route content
 * can still be server-rendered markup with no React props, and a click on it is
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
