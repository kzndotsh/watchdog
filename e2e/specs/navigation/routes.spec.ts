import { expect, test } from "../../fixtures/test";
import { expectNoNewA11yViolations } from "../../support/axe";
import { waitForHydrated, waitForPageHydrated } from "../../support/hydration";
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
        if (route.axe) await expectNoNewA11yViolations(page, route.path);
      }
    );
  }

  test(
    "sign-in page has no new accessibility violations",
    { tag: "@smoke" },
    async ({ page }) => {
      await page.goto("/auth/sign-in");
      await waitForHydrated(page);
      await expect(page.getByLabel("Email")).toBeVisible({ timeout: 30_000 });
      await expectNoNewA11yViolations(page, "/auth/sign-in");
    }
  );

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
