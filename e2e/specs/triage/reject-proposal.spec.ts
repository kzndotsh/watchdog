import { testId } from "@watchdog/test-kit/fixtures";

import { expect, test } from "../../fixtures/test";

test.describe("Triage", () => {
  test(
    "reject removes a pending proposal from the queue",
    { tag: "@smoke" },
    async ({ api, authenticatedCase, page, triagePage }) => {
      const { caseId, stamp } = authenticatedCase;
      const summary = `reject probe ${stamp}`;

      const entity = await api.createEntity(caseId, {
        kind: "person",
        name: "Bob",
        slug: `bob-${stamp}`,
      });

      await api.createProposal(caseId, {
        summary,
        patch: [
          {
            op: "create",
            resource: "claim",
            id: testId(42),
            data: {
              entityId: entity.id,
              text: "Bob was seen near the host",
              class: "observation",
            },
          },
        ],
      });

      await triagePage.goto("/triage");
      await expect(page.getByText(summary).first()).toBeVisible({
        timeout: 20_000,
      });
      await triagePage.reject(`noise ${stamp}`);

      await expect
        .poll(async () => api.countPendingProposals(caseId), {
          timeout: 20_000,
        })
        .toBe(0);
    }
  );
});
