import { expect, test } from "../../fixtures/test";
import { waitForPageHydrated } from "../../support/hydration";

test.describe("Case in the URL", () => {
  test(
    "two tabs hold two Cases at once, and a reload keeps each tab's Case",
    { tag: "@smoke" },
    async ({ api, authenticatedCase, casesPage, page }) => {
      test.setTimeout(180_000);
      const first = authenticatedCase;
      const secondName = `Second ${first.stamp}`;
      await casesPage.createCase(secondName);
      const second = (await api.listCases()).find(
        (row) => row.name === secondName
      );
      if (second === undefined) throw new Error("second case not created");

      const crumb = (name: string) => `Case ${name}`;

      // Tab one works the first Case; tab two (same browser, same cookies) the second.
      await page.goto(`/cases/${first.caseSlug}/tasks`);
      await waitForPageHydrated(page);
      await expect(
        page.getByRole("link", { name: crumb(first.caseName) })
      ).toBeVisible({ timeout: 30_000 });

      const tabTwo = await page.context().newPage();
      await tabTwo.goto(`/cases/${second.slug}/tasks`);
      await waitForPageHydrated(tabTwo);
      await expect(
        tabTwo.getByRole("link", { name: crumb(secondName) })
      ).toBeVisible({ timeout: 30_000 });

      // The cookie now remembers the second Case, but tab one's URL still names the first.
      await page.reload();
      await waitForPageHydrated(page);
      await expect(page).toHaveURL(
        new RegExp(`/cases/${first.caseSlug}/tasks$`)
      );
      await expect(
        page.getByRole("link", { name: crumb(first.caseName) })
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        tabTwo.getByRole("link", { name: crumb(secondName) })
      ).toBeVisible();
    }
  );
});
