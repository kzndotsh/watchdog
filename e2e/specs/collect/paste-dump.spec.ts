import { expect, test } from "../../fixtures/test";

test.describe("Collect", () => {
  test(
    "paste dump adds evidence to the queue",
    { tag: "@smoke" },
    async ({ api, authenticatedCase, collectPage }) => {
      const body =
        "Contact bob@mailhost.test — see https://wiki.mailhost.test/bob";
      await collectPage.pasteDump(body);

      const evidence = await api.listEvidence(authenticatedCase.caseId);
      expect(evidence.length).toBeGreaterThan(0);
    }
  );
});
