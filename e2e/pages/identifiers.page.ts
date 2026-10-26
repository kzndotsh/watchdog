import { BasePage } from "./base.page";

export class IdentifiersPage extends BasePage {
  async open(caseSlug: string): Promise<void> {
    await this.goto(`/cases/${caseSlug}/identifiers`);
  }

  /** The values of the rows the table shows (the loaded page). */
  async visibleValues(): Promise<string[]> {
    return this.page
      .getByRole("textbox", { name: "Identifier value" })
      .evaluateAll((els) =>
        els.flatMap((el) => (el instanceof HTMLInputElement ? [el.value] : []))
      );
  }

  async readIdentifierValues(caseSlug: string): Promise<string[]> {
    await this.open(caseSlug);
    return this.visibleValues();
  }

  /** Filters: add the first offered filter (Type) and pick one of its values. */
  async filterByType(label: string): Promise<void> {
    await this.page.getByRole("button", { name: /^Filters/ }).click();
    await this.page.getByRole("button", { name: "Add filter" }).click();
    await this.page.getByRole("combobox", { name: "Type values" }).click();
    await this.page.getByRole("option", { name: label }).click();
    await this.page.keyboard.press("Escape");
    await this.page.keyboard.press("Escape");
  }

  async search(text: string): Promise<void> {
    await this.page
      .getByRole("searchbox", { name: "Search identifiers" })
      .fill(text);
  }
}
