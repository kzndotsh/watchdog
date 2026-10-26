import { testId } from "@watchdog/test-kit/fixtures";

import { expect, test } from "../../fixtures/test";
import { clickHydrated, waitForPageHydrated } from "../../support/hydration";

test.describe("Triage queue", () => {
  test(
    "opens on pending from the sidebar, searches on the server, with the view in the URL",
    { tag: "@smoke" },
    async ({ api, authenticatedCase, page, triagePage }) => {
      const { caseId, caseSlug, stamp } = authenticatedCase;
      const entity = await api.createEntity(caseId, {
        kind: "person",
        name: "Cleo",
        slug: `cleo-${stamp}`,
      });
      const summaries = [
        `lead one ${stamp}`,
        `lead two ${stamp}`,
        `noise ${stamp}`,
      ];
      for (const [n, summary] of summaries.entries()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- created in order, so the newest is known
        await api.createProposal(caseId, {
          summary,
          patch: [
            {
              op: "create",
              resource: "claim",
              id: testId(60 + n),
              data: {
                entityId: entity.id,
                text: `Cleo claim ${String(n)}`,
                class: "observation",
              },
            },
          ],
        });
      }

      await page.goto(`/cases/${caseSlug}`);
      await waitForPageHydrated(page);
      await clickHydrated(
        page.getByRole("link", { name: "Triage", exact: true }).first()
      );
      // The nav link carries the pending view: the list itself has no default filter.
      await expect(page).toHaveURL(/\/triage\?.*status=/);
      await expect(page.getByText("Status: Pending")).toBeVisible({
        timeout: 30_000,
      });
      await expect(triagePage.queueRows()).toHaveCount(3);

      await triagePage.search("lead two");
      await expect(page).toHaveURL(/[?&]q=/);
      await expect(triagePage.queueRows()).toHaveCount(1);
      await expect(triagePage.queueRows().first()).toContainText(
        `lead two ${stamp}`
      );

      // The view is the URL: a reload opens the same filtered, searched queue.
      await page.reload();
      await expect(triagePage.queueRows()).toHaveCount(1, { timeout: 30_000 });
      await expect(page.getByText("Status: Pending")).toBeVisible();
    }
  );
});
