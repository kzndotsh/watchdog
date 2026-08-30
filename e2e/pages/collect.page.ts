import { BasePage } from "./base.page";

export class CollectPage extends BasePage {
  async pasteDump(body: string): Promise<void> {
    await this.goto("/collect");
    await this.page.getByRole("button", { name: "Paste" }).first().click();
    await this.page
      .getByPlaceholder("Paste page text, tool output, notes…")
      .fill(body);
    await this.page.getByRole("button", { name: /add evidence/i }).click();
    await this.page
      .getByRole("dialog")
      .waitFor({ state: "hidden", timeout: 20_000 });
  }

  async harvest(): Promise<void> {
    await this.goto("/collect");
    await this.page
      .getByRole("button", { name: /^harvest$/i })
      .click({ timeout: 30_000 });
  }
}
