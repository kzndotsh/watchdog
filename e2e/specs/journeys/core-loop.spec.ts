import { expect, test } from "../../fixtures/test";

test.describe("Core loop journey", () => {
  test(
    "signs in, dumps evidence, harvests, accepts into the dossier",
    { tag: "@journey" },
    async ({
      api,
      authenticatedCase,
      collectPage,
      identifiersPage,
      page,
      triagePage,
    }) => {
      test.setTimeout(180_000);
      const { caseId, caseSlug, stamp } = authenticatedCase;

      const entity = await api.createEntity(caseId, {
        kind: "person",
        name: "Ada",
        slug: `ada-${stamp}`,
      });
      expect(entity.name).toBe("Ada");

      await collectPage.pasteDump(
        caseSlug,
        "Contact alice@mailhost.test — see https://wiki.mailhost.test/ada"
      );

      const evidence = await api.listEvidence(caseId);
      expect(evidence.length).toBeGreaterThan(0);
      const dumped = evidence[0];
      if (dumped === undefined) throw new Error("paste dump missing");

      await api.attachEvidence(caseId, dumped.id, entity.id);
      await collectPage.harvest(caseSlug);

      await api.waitForPendingProposal(caseId, 120_000);

      await triagePage.clickAccept(caseSlug);
      await expect(page.getByRole("button", { name: /^accept$/i })).toBeHidden({
        timeout: 20_000,
      });

      await expect
        .poll(async () => identifiersPage.readIdentifierValues(caseSlug), {
          timeout: 20_000,
        })
        .toContain("alice@mailhost.test");
    }
  );
});
