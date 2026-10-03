import { expect, test } from "../../fixtures/test";
import { waitForPageHydrated } from "../../support/hydration";

test.describe("Auth users (instance admin)", () => {
  test(
    "first user sees Users with own email and no Impersonate",
    { tag: "@smoke" },
    async ({ authPage, page }) => {
      const stamp = `${Date.now()}`;
      await authPage.signUp(stamp);

      await page.goto("/settings?tab=users");
      await waitForPageHydrated(page);
      // The tab title and subtitle come from the settings shell; the panel is the account list.
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({
        timeout: 30_000,
      });
      const usersPanel = page.getByRole("main");
      await expect(
        usersPanel.getByText(`e2e.${stamp}@mailhost.test`, { exact: false })
      ).toBeVisible();
      await expect(usersPanel.getByText("Impersonate")).toHaveCount(0);
    }
  );
});
