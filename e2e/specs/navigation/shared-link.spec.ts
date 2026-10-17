import type { Browser, Page } from "@playwright/test";

import { testId } from "@watchdog/test-kit/fixtures";

import { expect, test } from "../../fixtures/test";
import { e2eOrigin } from "../../support/env";
import { waitForHydrated, waitForPageHydrated } from "../../support/hydration";

/**
 * The owner invites a teammate and the teammate signs up through the accept link, in a
 * separate browser context (no shared cookies). Returns the teammate's page and a cleanup.
 */
async function joinAsTeammate(
  owner: Page,
  browser: Browser,
  stamp: string
): Promise<{ member: Page; close: () => Promise<void> }> {
  await owner.goto("/settings?tab=members");
  await waitForPageHydrated(owner);
  await owner.getByLabel("Email").fill(`e2e.member.${stamp}@mailhost.test`);
  await owner.getByRole("button", { name: "Invite" }).click();
  const copy = owner.getByRole("button", { name: "Copy link" });
  await expect(copy).toBeVisible({ timeout: 30_000 });
  const acceptUrl = await copy.getAttribute("data-accept-url");
  if (!acceptUrl) throw new Error("missing invitation accept url");

  const memberContext = await browser.newContext({ baseURL: e2eOrigin });
  const member = await memberContext.newPage();
  await member.goto(acceptUrl);
  await waitForHydrated(member);
  const signupPass = process.env.E2E_SIGNUP_PASS ?? "E2e-passw0rd-long";
  await member.getByLabel("Name").fill("E2E Member");
  await member.getByLabel("Password", { exact: true }).fill(signupPass);
  await member
    .getByRole("button", { name: /create account and join/i })
    .click();
  await member.waitForURL((url) => !url.pathname.includes("/auth/"), {
    timeout: 30_000,
  });
  return { member, close: async () => memberContext.close() };
}

test.describe("Shared Case links", () => {
  test(
    "a Dossier link opens the right Case for another member in their own browser",
    { tag: "@smoke" },
    async ({ api, authenticatedCase, browser, casesPage, page }) => {
      test.setTimeout(180_000);

      // The link's Case holds the Entity. A second Case is created after it, so the
      // owner's own Active Case is the other one: the link must not depend on it.
      const entity = await api.createEntity(authenticatedCase.caseId, {
        kind: "person",
        name: "Shared Ada",
        slug: `shared-ada-${authenticatedCase.stamp}`,
      });
      await casesPage.createCase(`Other ${authenticatedCase.stamp}`);
      const sharedPath = `/cases/${authenticatedCase.caseSlug}/entities/${entity.slug}`;

      // The owner invites a teammate, who joins in their own browser.
      const { member, close } = await joinAsTeammate(
        page,
        browser,
        authenticatedCase.stamp
      );
      try {
        // Opening the shared link lands on the Entity, inside the link's Case.
        await member.goto(sharedPath);
        await waitForPageHydrated(member);
        await expect(
          member.getByRole("textbox", { name: "Entity name" })
        ).toHaveValue(entity.name, { timeout: 30_000 });
        await expect(member).toHaveURL(new RegExp(`${sharedPath}$`));
        await expect(
          member.getByRole("link", {
            name: `Case ${authenticatedCase.caseName}`,
          })
        ).toBeVisible();

        // A link to a Case the organization does not have is Case not found.
        await member.goto("/cases/no-such-case-here/entities/none");
        await waitForPageHydrated(member);
        await expect(
          member.getByRole("heading", { name: "Case not found" })
        ).toBeVisible({ timeout: 30_000 });
      } finally {
        await close();
      }
    }
  );

  test("a Job link and a Proposal link open on the selected row for another member", async ({
    api,
    authenticatedCase,
    browser,
    casesPage,
    collectPage,
    page,
  }) => {
    test.setTimeout(240_000);
    const { caseId, caseSlug, stamp } = authenticatedCase;

    // A Proposal first, so it is the only one to read the id of.
    const entity = await api.createEntity(caseId, {
      kind: "person",
      name: "Linked Bob",
      slug: `linked-bob-${stamp}`,
    });
    const summary = `shared proposal ${stamp}`;
    await api.createProposal(caseId, {
      summary,
      patch: [
        {
          op: "create",
          resource: "claim",
          id: testId(43),
          data: {
            entityId: entity.id,
            text: "Bob was seen near the host",
            class: "observation",
          },
        },
      ],
    });
    const [proposal] = await api.listProposals(caseId);
    if (proposal === undefined) throw new Error("proposal not created");

    // A Job: a Harvest over a pasted dump starts one.
    await collectPage.pasteDump("Contact bob@mailhost.test for the ledger");
    await collectPage.harvest();
    let jobId: string | undefined;
    await expect
      .poll(
        async () => {
          jobId = (await api.listJobs(caseId))[0]?.id;
          return jobId;
        },
        { timeout: 60_000 }
      )
      .toBeDefined();
    if (jobId === undefined) throw new Error("harvest started no Job");

    // The owner's own Active Case is another one: the links must not depend on it.
    await casesPage.createCase(`Other ${stamp}`);
    const { member, close } = await joinAsTeammate(page, browser, stamp);
    try {
      const jobPath = `/cases/${caseSlug}/collect?id=${jobId}`;
      await member.goto(jobPath);
      await waitForPageHydrated(member);
      await expect(
        member
          .getByRole("listbox", { name: "Collect items" })
          .getByRole("option", { selected: true })
      ).toBeVisible({ timeout: 30_000 });
      await expect(member.getByText("Select an item")).toBeHidden();
      await expect(member).toHaveURL(new RegExp(`${jobPath}$`));

      const proposalPath = `/cases/${caseSlug}/triage?proposalId=${proposal.id}`;
      await member.goto(proposalPath);
      await waitForPageHydrated(member);
      await expect(member.getByText(summary).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(member.getByText("Select a proposal")).toBeHidden();
      await expect(member).toHaveURL(new RegExp(`${proposalPath}$`));
    } finally {
      await close();
    }
  });
});
