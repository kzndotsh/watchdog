import { expect, test } from "../../fixtures/test";
import { e2eOrigin } from "../../support/env";
import { waitForHydrated, waitForPageHydrated } from "../../support/hydration";

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

      // The owner invites a teammate and hands them the accept link.
      await page.goto("/settings?tab=members");
      await waitForPageHydrated(page);
      const inviteEmail = `e2e.member.${authenticatedCase.stamp}@mailhost.test`;
      await page.getByLabel("Email").fill(inviteEmail);
      await page.getByRole("button", { name: "Invite" }).click();
      const copy = page.getByRole("button", { name: "Copy link" });
      await expect(copy).toBeVisible({ timeout: 30_000 });
      const acceptUrl = await copy.getAttribute("data-accept-url");
      if (!acceptUrl) throw new Error("missing invitation accept url");

      // The teammate is another user in a separate browser context (no shared cookies).
      const memberContext = await browser.newContext({ baseURL: e2eOrigin });
      try {
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
        await memberContext.close();
      }
    }
  );
});
