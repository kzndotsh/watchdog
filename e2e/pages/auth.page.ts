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
  }

  async signOut(): Promise<void> {
    await this.page.goto("/auth/sign-out");
    await this.page.waitForURL(/\/auth\/sign-in/, { timeout: 30_000 });
    await waitForHydrated(this.page);
  }
}
