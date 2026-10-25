import { clickHydrated } from "../support/hydration";
import { BasePage } from "./base.page";

export class CollectPage extends BasePage {
  async pasteDump(caseSlug: string, body: string): Promise<void> {
    await this.goto(`/cases/${caseSlug}/collect`);
    await clickHydrated(
      this.page.getByRole("button", { name: "Paste" }).first()
    );
    await this.page
      .getByPlaceholder("Paste page text, tool output, notes…")
      .fill(body);
    await this.page.getByRole("button", { name: /add evidence/i }).click();
    await this.page
      .getByRole("dialog", { name: "Paste evidence" })
      .waitFor({ state: "hidden", timeout: 20_000 });
  }

  async harvest(caseSlug: string): Promise<void> {
    await this.goto(`/cases/${caseSlug}/collect`);
    await clickHydrated(this.page.getByRole("button", { name: /^harvest$/i }));
  }
}
