import { BasePage } from "./base.page";

export class IdentifiersPage extends BasePage {
  async readIdentifierValues(caseSlug: string): Promise<string[]> {
    await this.goto(`/cases/${caseSlug}/identifiers`);
    return this.page
      .getByRole("textbox", { name: "Identifier value" })
      .evaluateAll((els) =>
        els.flatMap((el) => (el instanceof HTMLInputElement ? [el.value] : []))
      );
  }
}
