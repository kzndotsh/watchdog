import { expect, test } from "../../fixtures/test";
import { clickHydrated } from "../../support/hydration";

/**
 * Deleting a Case is a tombstone (#304): it leaves every list at once, an owner or admin can
 * bring it back from the toast or from Deleted Cases, and it comes back with its data.
 * The first account of an instance owns its organization, so the signed-up user may delete.
 */
test.describe("Delete and restore a Case", () => {
  test(
    "deletes a case and restores it from the toast",
    { tag: "@smoke" },
    async ({ authenticatedCase, casesPage, page }) => {
      const name = `Doomed ${authenticatedCase.stamp}`;
      await casesPage.createCase(name);

      await casesPage.deleteCase(name);

      // Gone from the list at once, with a toast that offers Restore.
      await expect(casesPage.cardFor(name)).toHaveCount(0);
      const toast = page.getByText(`\u201C${name}\u201D deleted`);
      await expect(toast).toBeVisible({ timeout: 15_000 });
      await clickHydrated(page.getByRole("button", { name: "Restore" }));

      await expect(page.getByText(`\u201C${name}\u201D restored`)).toBeVisible({
        timeout: 15_000,
      });
      await expect(casesPage.cardFor(name)).toBeVisible({ timeout: 15_000 });
    }
  );

  test("deletes a case, finds it in Deleted Cases and restores it", async ({
    authenticatedCase,
    casesPage,
    page,
  }) => {
    const name = `Archived ${authenticatedCase.stamp}`;
    await casesPage.createCase(name);
    await casesPage.deleteCase(name);
    await expect(casesPage.cardFor(name)).toHaveCount(0);

    await casesPage.openDeletedCases();

    const row = casesPage.deletedRowFor(name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(/days left to restore/);
    await clickHydrated(row.getByRole("button", { name: "Restore" }));
    await expect(page.getByText(`\u201C${name}\u201D restored`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(row).toHaveCount(0);

    await casesPage.goto("/cases");
    await expect(casesPage.cardFor(name)).toBeVisible({ timeout: 15_000 });
  });

  test("a link to a deleted case shows its owner a restore screen", async ({
    authenticatedCase,
    casesPage,
    page,
  }) => {
    const name = `Linked ${authenticatedCase.stamp}`;
    await casesPage.createCase(name);
    await casesPage.deleteCase(name);
    const deletedSlug = name.toLowerCase().replaceAll(/\s+/g, "-");

    await casesPage.goto(`/cases/${deletedSlug}`);

    await expect(
      page.getByRole("heading", { name: "Case deleted" })
    ).toBeVisible({ timeout: 30_000 });
    await clickHydrated(page.getByRole("button", { name: "Restore case" }));
    await expect(page).toHaveURL(new RegExp(`/cases/${deletedSlug}$`), {
      timeout: 30_000,
    });
  });
});
