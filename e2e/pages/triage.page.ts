import { clickHydrated } from "../support/hydration";
import { BasePage } from "./base.page";

export class TriagePage extends BasePage {
  async clickAccept(caseSlug: string): Promise<void> {
    await this.goto(`/cases/${caseSlug}/triage`);
    await clickHydrated(
      this.page.getByRole("button", { name: /^accept$/i }),
      90_000
    );
  }

  async reject(caseSlug: string, reason = "e2e reject"): Promise<void> {
    await this.goto(`/cases/${caseSlug}/triage`);
    await clickHydrated(this.page.getByRole("button", { name: /^reject$/i }));
    await this.page.getByPlaceholder("Reject reason (optional)").fill(reason);
    await this.page.getByRole("button", { name: /confirm reject/i }).click();
    await this.page
      .getByRole("button", { name: /confirm reject/i })
      .waitFor({ state: "hidden", timeout: 20_000 });
  }

  /** The queue rows the page shows (the loaded page). */
  queueRows() {
    return this.page
      .getByRole("listbox", { name: "Proposals" })
      .getByRole("option");
  }

  async search(text: string): Promise<void> {
    await this.page
      .getByRole("searchbox", { name: "Search proposals" })
      .fill(text);
  }

  async selectProposalSummary(summary: string): Promise<void> {
    await this.page.getByText(summary).first().click();
  }

  async setConfidence(label: "Confirmed" | "Possible" | "Unverified") {
    await this.page.getByRole("combobox", { name: "Confidence" }).click();
    // Confidence options live in a portaled listbox (not under the combobox node).
    // Proposal queue rows are also role=option and can substring-match "confirmed".
    await this.page
      .getByRole("listbox")
      .filter({
        has: this.page.getByRole("option", { name: "Possible", exact: true }),
      })
      .getByRole("option", { name: label, exact: true })
      .click();
  }
}
