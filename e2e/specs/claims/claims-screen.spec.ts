import { expect, test } from "../../fixtures/test";
import { waitForPageHydrated } from "../../support/hydration";

test.describe("Claims screen", () => {
  test(
    "lists every Entity's Claims and filters them by tier",
    { tag: "@smoke" },
    async ({ api, authenticatedCase, page }) => {
      const { caseId, caseSlug, stamp } = authenticatedCase;
      const seed = [
        {
          name: "Claims Ada",
          text: `Registered ada.example ${stamp}`,
          confidence: "possible",
        },
        {
          name: "Claims Acme",
          text: `Incorporated in 2021 ${stamp}`,
          confidence: "unverified",
        },
      ] as const;
      await Promise.all(
        seed.map(async (row, index) => {
          const entity = await api.createEntity(caseId, {
            kind: "person",
            name: row.name,
            slug: `claims-${index}-${stamp}`,
          });
          await api.fetch(
            "POST",
            `/cases/${caseId}/entities/${entity.id}/claims`,
            {
              caseId,
              entityId: entity.id,
              text: row.text,
              confidence: row.confidence,
            }
          );
        })
      );

      await page.goto(`/cases/${caseSlug}/claims`);
      await waitForPageHydrated(page);

      await expect(page.getByText(seed[0].text)).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(seed[1].text)).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Claims Acme" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^All/ }).getByText("2")
      ).toBeVisible();

      await page.getByRole("button", { name: /^Unverified/ }).click();
      await expect(page).toHaveURL(/confidence=/);
      await expect(page.getByText(seed[0].text)).toBeHidden();
      await expect(page.getByText(seed[1].text)).toBeVisible();
    }
  );
});
