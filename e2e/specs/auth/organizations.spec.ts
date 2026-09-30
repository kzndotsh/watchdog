import { expect, test } from "../../fixtures/test";
import { waitForHydrated } from "../../support/hydration";

test.describe("Organizations", () => {
  test(
    "a new account creates its organization, then a second one from the switcher",
    { tag: "@smoke" },
    async ({ authPage, page }) => {
      const stamp = `${Date.now()}`;
      await authPage.signUp(stamp);

      const switcher = page.getByRole("button", {
        name: new RegExp(`E2E Org ${stamp}`),
      });
      await expect(switcher).toBeVisible({ timeout: 30_000 });

      await switcher.click();
      await page.getByRole("menuitem", { name: "Create organization" }).click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("textbox", { name: "Name", exact: true })
        .fill(`Second Org ${stamp}`);
      await dialog.getByRole("button", { name: "Create organization" }).click();

      // Creating reloads the app inside the new organization.
      await waitForHydrated(page);
      await expect(
        page.getByRole("button", { name: new RegExp(`Second Org ${stamp}`) })
      ).toBeVisible({ timeout: 30_000 });

      // Switch back to the first organization.
      await page
        .getByRole("button", { name: new RegExp(`Second Org ${stamp}`) })
        .click();
      await page
        .getByRole("menuitem", { name: new RegExp(`E2E Org ${stamp}`) })
        .click();
      await waitForHydrated(page);
      await expect(
        page.getByRole("button", { name: new RegExp(`E2E Org ${stamp}`) })
      ).toBeVisible({ timeout: 30_000 });
    }
  );
});
