import { BasePage } from "./base.page";

export class TriagePage extends BasePage {
  async clickAccept(): Promise<void> {
    await this.goto("/triage");
    await this.page
      .getByRole("button", { name: /^accept$/i })
      .click({ timeout: 90_000 });
  }

  async reject(reason = "e2e reject"): Promise<void> {
    await this.goto("/triage");
    await this.page.getByRole("button", { name: /^reject$/i }).click();
    await this.page.getByPlaceholder("Reject reason (optional)").fill(reason);
    await this.page.getByRole("button", { name: /confirm reject/i }).click();
    await this.page
      .getByRole("button", { name: /confirm reject/i })
      .waitFor({ state: "hidden", timeout: 20_000 });
  }

  async selectProposalSummary(summary: string): Promise<void> {
    await this.page.getByText(summary).first().click();
  }

  async setConfidence(label: "Confirmed" | "Possible" | "Unverified") {
    await this.page.getByRole("combobox", { name: "Confidence" }).click();
    await this.page.getByRole("option", { name: label }).click();
  }
}
