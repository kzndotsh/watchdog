import { expect, test } from "../../fixtures/test";

test.describe("Cases", () => {
  test(
    "creates a case from the manage list",
    { tag: "@smoke" },
    async ({ authenticatedCase, casesPage, page }) => {
      await page.goto("/cases");
      await expect(
        page.getByText(authenticatedCase.caseName).first()
      ).toBeVisible({ timeout: 15_000 });

      const extraName = `Follow-on ${authenticatedCase.stamp}`;
      await casesPage.createCase(extraName);
      await expect(page.getByText(extraName).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  );
});
