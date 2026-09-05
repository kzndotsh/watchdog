import { expect, test } from "../../fixtures/test";
import { waitForHydrated } from "../../support/hydration";

test.describe("Auth users (instance admin)", () => {
  test(
    "first user sees Users with own email and no Impersonate",
    { tag: "@smoke" },
    async ({ authPage, page }) => {
      const stamp = `${Date.now()}`;
      await authPage.signUp(stamp);

      await page.goto("/settings?tab=users");
      await waitForHydrated(page);
      const usersPanel = page
        .locator("section")
        .filter({ hasText: "Install accounts" });
      await expect(
        usersPanel.getByRole("heading", { name: "Users" })
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        usersPanel.getByText(`e2e.${stamp}@mailhost.test`, { exact: false })
      ).toBeVisible();
      await expect(usersPanel.getByText("Impersonate")).toHaveCount(0);
    }
  );
});
