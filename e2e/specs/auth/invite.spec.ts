import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import type { AuthPage } from "../../pages/auth.page";
import { waitForHydrated, waitForPageHydrated } from "../../support/hydration";

/**
 * The owner invites a new address from Settings (open with no Case too: it is not gated),
 * signs out, and the invitee accepts the link and creates their account.
 */
async function inviteAndJoin(
  authPage: AuthPage,
  page: Page,
  stamp: string
): Promise<void> {
  await page.goto("/settings?tab=members");
  await waitForPageHydrated(page);
  await expect(page.getByRole("button", { name: "Invite" })).toBeVisible({
    timeout: 30_000,
  });

  const inviteEmail = `e2e.invitee.${stamp}@mailhost.test`;
  await page.getByLabel("Email").fill(inviteEmail);
  await page.getByRole("button", { name: "Invite" }).click();

  const copy = page.getByRole("button", { name: "Copy link" });
  await expect(copy).toBeVisible({ timeout: 30_000 });
  const acceptUrl = await copy.getAttribute("data-accept-url");
  expect(acceptUrl).toBeTruthy();
  if (!acceptUrl) throw new Error("missing invitation accept url");

  await authPage.signOut();

  await page.goto(acceptUrl);
  await waitForHydrated(page);
  await expect(page.getByLabel("Email")).toHaveValue(inviteEmail);

  const signupPass = process.env.E2E_SIGNUP_PASS ?? "E2e-passw0rd-long";
  await page.getByLabel("Name").fill("E2E Invitee");
  await page.getByLabel("Password", { exact: true }).fill(signupPass);
  await page.getByRole("button", { name: /create account and join/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/"), {
    timeout: 30_000,
  });
  await expect(page.locator("html[data-hydrated=true]")).toBeAttached();
}

test.describe("Auth team invite", () => {
  test(
    "owner invite link lets a new user join without public sign-up",
    { tag: "@smoke" },
    async ({ authPage, page }) => {
      const stamp = `${Date.now()}`;
      await authPage.signUp(stamp);

      await inviteAndJoin(authPage, page, stamp);

      // The organization already has the owner's Case, so the invitee lands in the app,
      // not on the first-Case step.
      await expect(page).not.toHaveURL(/\/onboarding/);
      await expect(page.getByText("Create your first Case")).toHaveCount(0);
    }
  );

  test(
    "an invitee joining an organization with no Case is asked for its first Case",
    { tag: "@smoke" },
    async ({ authPage, page }) => {
      const stamp = `${Date.now()}`;
      // The owner stops on the first-Case step: Settings (members, invites) stays open.
      await authPage.signUp(stamp, null);

      await inviteAndJoin(authPage, page, stamp);

      // A member may create a Case, so the step is theirs too.
      await authPage.createFirstCase(`Invitee Case ${stamp}`);
      await expect(page).toHaveURL(/\/cases\//);
    }
  );
});
