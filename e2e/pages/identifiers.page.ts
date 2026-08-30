import { BasePage } from "./base.page";

export class IdentifiersPage extends BasePage {
  async readIdentifierValues(): Promise<string[]> {
    await this.goto("/identifiers");
    return this.page
      .getByRole("textbox", { name: "Identifier value" })
      .evaluateAll((els) =>
        els.flatMap((el) => (el instanceof HTMLInputElement ? [el.value] : []))
      );
  }
}
