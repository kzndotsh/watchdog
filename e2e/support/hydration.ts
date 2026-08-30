import type { Page } from "@playwright/test";

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
