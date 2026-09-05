import { expect, test } from "../../fixtures/test";
import { waitForHydrated } from "../../support/hydration";

test.describe("Auth team invite", () => {
  test(
    "owner invite link lets a new user join without public sign-up",
    { tag: "@smoke" },
    async ({ authPage, page }) => {
      const stamp = `${Date.now()}`;
      await authPage.signUp(stamp);

      await page.goto("/settings?tab=team");
      await waitForHydrated(page);
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
      await page
        .getByRole("button", { name: /create account and join/i })
        .click();
      await page.waitForURL((url) => !url.pathname.includes("/auth/"), {
        timeout: 30_000,
      });
      await expect(page.locator("html[data-hydrated=true]")).toBeAttached();
    }
  );
});
