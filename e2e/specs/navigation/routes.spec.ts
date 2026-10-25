import { expect, test } from "../../fixtures/test";
import { expectNoNewA11yViolations } from "../../support/axe";
import { waitForHydrated, waitForPageHydrated } from "../../support/hydration";
import { primaryRoutes, routeUrl } from "../../support/navigation-routes";

test.describe("Navigation", () => {
  for (const route of primaryRoutes) {
    test(
      `loads ${route.path}`,
      { tag: "@smoke" },
      async ({ authenticatedCase, page }) => {
        await page.goto(routeUrl(route, authenticatedCase.caseSlug));
        await waitForPageHydrated(page);
        await route.ready(page);
        if (route.axe) await expectNoNewA11yViolations(page, route.path);
      }
    );
  }

  test(
    "Case-less Work URLs are gone: they answer not found, with no redirect",
    { tag: "@smoke" },
    async ({ authenticatedCase, page }) => {
      for (const screen of ["collect", "triage", "tasks"] as const) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one page, navigated in turn
        const response = await page.goto(`/${screen}?x=1`);
        expect(response?.status()).toBe(404);
        expect(new URL(page.url()).pathname).toBe(`/${screen}`);
      }
      const slugged = await page.goto(
        `/cases/${authenticatedCase.caseSlug}/collect`
      );
      expect(slugged?.status()).toBe(200);
    }
  );

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

      await page.goto(
        `/cases/${authenticatedCase.caseSlug}/entities/${entity.slug}`
      );
      await waitForPageHydrated(page);
      await expect(
        page.getByRole("textbox", { name: "Entity name" })
      ).toHaveValue(entity.name, { timeout: 30_000 });
    }
  );
});
