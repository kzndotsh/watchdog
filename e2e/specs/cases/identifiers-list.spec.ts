import { expect, test } from "../../fixtures/test";

test.describe("Identifiers table", () => {
  test(
    "filters and searches on the server, with the view in the URL",
    { tag: "@smoke" },
    async ({ api, authenticatedCase, identifiersPage, page }) => {
      const { caseId, caseSlug, stamp } = authenticatedCase;
      const entity = await api.createEntity(caseId, {
        kind: "person",
        name: "Ada",
        slug: `ada-${stamp}`,
      });
      await api.createIdentifier(caseId, entity.id, {
        type: "email",
        value: "ada@mailhost.test",
      });
      await api.createIdentifier(caseId, entity.id, {
        type: "email",
        value: "grace@mailhost.test",
      });
      await api.createIdentifier(caseId, entity.id, {
        type: "phone",
        value: "+15550100",
      });

      await identifiersPage.open(caseSlug);
      await expect(page.getByText("Showing 3")).toBeVisible();

      await identifiersPage.filterByType("Email");
      await expect(page).toHaveURL(/[?&]type=/);
      await expect(page.getByText("Showing 2")).toBeVisible();
      await expect
        .poll(async () => identifiersPage.visibleValues())
        .toEqual(["ada@mailhost.test", "grace@mailhost.test"]);

      await identifiersPage.search("grace");
      await expect(page).toHaveURL(/[?&]q=/);
      await expect
        .poll(async () => identifiersPage.visibleValues())
        .toEqual(["grace@mailhost.test"]);

      // The view is the URL: a reload opens the same filtered, searched page.
      await page.reload();
      await expect
        .poll(async () => identifiersPage.visibleValues())
        .toEqual(["grace@mailhost.test"]);
      await expect(page.getByText("Type: Email")).toBeVisible();
    }
  );
});
