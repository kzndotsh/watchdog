import { expect, test } from "../../fixtures/test";
import { waitForPageHydrated } from "../../support/hydration";
import { primaryRoutes } from "../../support/navigation-routes";

test.describe("Navigation", () => {
  for (const route of primaryRoutes) {
    test(
      `loads ${route.path}`,
      { tag: "@smoke" },
      async ({ authenticatedCase: _authenticatedCase, page }) => {
        await page.goto(route.path);
        await waitForPageHydrated(page);
        await route.ready(page);
      }
    );
  }

  test(
    "loads dossier route for an entity slug",
    { tag: "@smoke" },
    async ({ api, authenticatedCase, page }) => {
      const entity = await api.createEntity(authenticatedCase.caseId, {
        kind: "person",
        name: "Route Ada",
        slug: `route-ada-${authenticatedCase.stamp}`,
      });

      await page.goto(`/entities/${entity.slug}`);
      await waitForPageHydrated(page);
      await expect(
        page.getByRole("textbox", { name: "Entity name" })
      ).toHaveValue(entity.name, { timeout: 30_000 });
    }
  );
});
