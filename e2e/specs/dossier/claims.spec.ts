import { expect, test } from "../../fixtures/test";
import { waitForPageHydrated } from "../../support/hydration";

test.describe("Dossier Claims", () => {
  test(
    "adds a Claim through /api/rpc and lists it after the write",
    { tag: "@smoke" },
    async ({ api, authenticatedCase, page }) => {
      const { caseId, caseSlug, stamp } = authenticatedCase;
      const entity = await api.createEntity(caseId, {
        kind: "person",
        name: "Claimed Ada",
        slug: `claimed-ada-${stamp}`,
      });

      // The Claims tab reads its first page from the browser, over the RPC link.
      const firstPage = page.waitForResponse(
        (response) =>
          response.url().includes("/api/rpc/claims/list") && response.ok()
      );
      await page.goto(`/cases/${caseSlug}/entities/${entity.slug}?tab=claims`);
      await waitForPageHydrated(page);
      await firstPage;

      await page.getByRole("button", { name: "Add claim" }).click();
      await page.getByPlaceholder("Claim text").fill(`Runs the host ${stamp}`);
      const created = page.waitForResponse((response) =>
        response.url().includes("/api/rpc/claims/create")
      );
      await page.getByRole("button", { name: "Save" }).click();
      expect((await created).ok()).toBe(true);

      // The write invalidates the Case's Claims keys: the list refetches and shows it.
      await expect(page.getByText(`Runs the host ${stamp}`)).toBeVisible({
        timeout: 30_000,
      });
    }
  );
});
