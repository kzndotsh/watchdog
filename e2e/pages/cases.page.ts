import { BasePage } from "./base.page";

export class CasesPage extends BasePage {
  async createCase(name: string): Promise<void> {
    await this.goto("/cases");
    const trigger = this.page.getByRole("button", { name: "New Case" }).first();
    await trigger.waitFor({ timeout: 30_000 });
    await trigger.click();
    const dialog = this.page.getByRole("alertdialog");
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
    await dialog.getByLabel("Case name").fill(name);
    await dialog.getByRole("button", { name: /^create$/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 15_000 });
  }
}
