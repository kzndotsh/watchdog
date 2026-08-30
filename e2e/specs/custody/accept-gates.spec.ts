import { testId } from "@watchdog/test-kit/fixtures";

import { expect, test } from "../../fixtures/test";

test.describe("Custody accept gates", () => {
  test(
    "blocks confirmed without evidence and invalid identifier values",
    { tag: "@custody" },
    async ({ api, authenticatedCase, page, triagePage }) => {
      const { caseId, stamp } = authenticatedCase;

      const entity = await api.createEntity(caseId, {
        kind: "person",
        name: "Ada",
        slug: `ada-custody-${stamp}`,
      });

      await api.createProposal(caseId, {
        summary: "custody probe invalid identifier",
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

      await triagePage.goto("/triage");
      await expect(page.getByText("Invalid value")).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.getByRole("button", { name: /^accept$/i })
      ).toBeDisabled();

      await api.createProposal(caseId, {
        summary: "custody probe confirmed claim",
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

      await triagePage.goto("/triage");
      await triagePage.selectProposalSummary("Ada observed a host");
      await triagePage.setConfidence("Confirmed");
      await expect(
        page.getByText("confirmed requires at least 1 evidence item")
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^accept$/i })
      ).toBeDisabled();
    }
  );
});
