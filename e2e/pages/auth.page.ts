import type { Page } from "@playwright/test";

import { waitForHydrated } from "../support/hydration";

export class AuthPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async signUp(stamp: string): Promise<void> {
    const email = `e2e.${stamp}@mailhost.test`;
    const signupPass = process.env.E2E_SIGNUP_PASS ?? "E2e-passw0rd-long";
    await this.page.goto("/auth/sign-up");
    await waitForHydrated(this.page);
    await this.page.getByLabel("Name").fill("E2E Investigator");
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password", { exact: true }).fill(signupPass);
    const confirm = this.page.getByLabel("Confirm password");
    if (await confirm.count()) {
      await confirm.fill(signupPass);
    }
    await this.page.getByRole("button", { name: /^sign up$/i }).click();
    await this.page.waitForURL((url) => !url.pathname.includes("/auth/"), {
      timeout: 30_000,
    });
    await this.completeOnboarding(stamp);
  }

  /** A new account starts with no organization: create one when onboarding asks. */
  private async completeOnboarding(stamp: string): Promise<void> {
    // The protected layout redirects an account with no organization here. The URL
    // changes before the route renders, so wait for the form itself: until then the
    // sign-up fields are still on screen and a fill would land on them.
    await this.page.waitForURL(/\/onboarding/, { timeout: 30_000 });
    await this.page
      .getByText("Create your organization")
      .waitFor({ state: "visible", timeout: 30_000 });
    await this.page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(`E2E Org ${stamp}`);
    await this.page
      .getByRole("button", { name: "Create organization" })
      .click();
    await this.page.waitForURL((url) => !url.pathname.includes("/onboarding"), {
      timeout: 30_000,
    });
  }

  async signOut(): Promise<void> {
    await this.page.goto("/auth/sign-out");
    await this.page.waitForURL(/\/auth\/sign-in/, { timeout: 30_000 });
    await waitForHydrated(this.page);
  }
}
