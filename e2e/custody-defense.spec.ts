import { expect, test } from "@playwright/test";

import { testId } from "@watchdog/test-kit/fixtures";

import { apiJson, e2eApiParsers, setupAuthenticatedCase } from "./helpers";

test.describe("Custody defense", () => {
  test("blocks confirmed without evidence and invalid identifier values", async ({
    page,
  }) => {
    const { stamp, caseId } = await setupAuthenticatedCase(page, "Custody");

    const entity = await apiJson(
      page,
      "POST",
      `/cases/${caseId}/entities`,
      {
        caseId,
        kind: "person",
        name: "Ada",
        slug: `ada-custody-${stamp}`,
      },
      e2eApiParsers.entityId
    );

    await apiJson(page, "POST", `/cases/${caseId}/proposals`, {
      caseId,
      summary: "custody probe",
      patch: [
        {
          op: "create",
          resource: "identifier",
          id: testId(40),
          data: {
            entityId: entity.id,
            type: "email",
            value: "not-an-email",
          },
        },
      ],
    });

    await page.goto("/triage");
    await page.waitForSelector("html[data-hydrated=true]", { timeout: 30_000 });
    await expect(page.getByText("Invalid value")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: /^accept$/i })
    ).toBeDisabled();

    await apiJson(page, "POST", `/cases/${caseId}/proposals`, {
      caseId,
      summary: "confirmed probe",
      patch: [
        {
          op: "create",
          resource: "claim",
          id: testId(41),
          data: {
            entityId: entity.id,
            text: "Ada observed a host",
            class: "observation",
          },
        },
      ],
    });

    await page.goto("/triage");
    await page.waitForSelector("html[data-hydrated=true]", { timeout: 30_000 });
    await page.getByText("Ada observed a host").first().click();
    await page.getByRole("combobox", { name: "Confidence" }).click();
    await page.getByRole("option", { name: "Confirmed" }).click();
    await expect(
      page.getByText("confirmed requires at least 1 evidence item")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^accept$/i })
    ).toBeDisabled();
  });
});
