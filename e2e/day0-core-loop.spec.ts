import { expect, test } from "@playwright/test";

import {
  apiJson,
  dumpPasteViaUi,
  e2eApiParsers,
  setupAuthenticatedCase,
} from "./helpers";

test.describe("Day-0 core loop", () => {
  test("signs in, dumps evidence, harvests, accepts into the dossier", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { stamp, caseId } = await setupAuthenticatedCase(page, "Day0");

    const entity = await apiJson(
      page,
      "POST",
      `/cases/${caseId}/entities`,
      { caseId, kind: "person", name: "Ada", slug: `ada-${stamp}` },
      e2eApiParsers.entity
    );
    expect(entity.name).toBe("Ada");

    await dumpPasteViaUi(
      page,
      "Contact alice@mailhost.test — see https://wiki.mailhost.test/ada"
    );

    const evidence = await apiJson(
      page,
      "GET",
      `/cases/${caseId}/evidence`,
      undefined,
      e2eApiParsers.evidenceList
    );
    expect(evidence.length).toBeGreaterThan(0);
    const dumped = evidence[0];
    if (dumped === undefined) throw new Error("paste dump missing");

    await apiJson(page, "PATCH", `/cases/${caseId}/evidence/${dumped.id}`, {
      caseId,
      evidenceId: dumped.id,
      entityId: entity.id,
    });

    await page.goto("/collect");
    await page.waitForSelector("html[data-hydrated=true]", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^harvest$/i })).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /^harvest$/i }).click();

    await expect
      .poll(
        async () => {
          const proposals = await apiJson(
            page,
            "GET",
            `/cases/${caseId}/proposals`,
            undefined,
            e2eApiParsers.proposalList
          );
          return proposals.filter((row) => row.status === "pending").length;
        },
        { timeout: 120_000 }
      )
      .toBeGreaterThan(0);

    await page.goto("/triage");
    await page.waitForSelector("html[data-hydrated=true]", { timeout: 30_000 });
    const accept = page.getByRole("button", { name: /^accept$/i });
    await expect(accept).toBeVisible({ timeout: 90_000 });
    await accept.click();
    await expect(accept).toBeHidden({ timeout: 20_000 });

    await page.goto("/identifiers");
    await expect
      .poll(
        async () => {
          const values = await page
            .getByRole("textbox", { name: "Identifier value" })
            .evaluateAll((els) =>
              els.flatMap((el) =>
                el instanceof HTMLInputElement ? [el.value] : []
              )
            );
          return values.includes("alice@mailhost.test");
        },
        { timeout: 20_000 }
      )
      .toBe(true);
  });
});
