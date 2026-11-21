import type { Locator } from "@playwright/test";

import { BasePage } from "./base.page";

export class CasesPage extends BasePage {
  async createCase(name: string): Promise<void> {
    await this.goto("/cases");
    const trigger = this.page.getByRole("button", { name: "New Case" }).first();
    await trigger.click();
    const dialog = this.page.getByRole("dialog", { name: "New Case" });
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
    await dialog.getByLabel("Case name").fill(name);
    await dialog.getByRole("button", { name: /^create$/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 15_000 });
  }

  /**
   * The Case's name on its card on the Cases list: the card's name is a paragraph, which keeps
   * the sidebar switcher and the toast (other elements with the same text) out of the match.
   */
  cardFor(name: string): Locator {
    return this.page.locator("p", { hasText: name }).first();
  }

  /** Delete from the Cases list: right-click the card, confirm the plain dialog (no typed name: a delete is restorable). */
  async deleteCase(name: string): Promise<void> {
    await this.goto("/cases");
    await this.cardFor(name).waitFor({ state: "visible", timeout: 15_000 });
    await this.cardFor(name).click({ button: "right" });
    await this.page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = this.page.getByRole("alertdialog");
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
    await dialog.getByRole("button", { name: "Delete case" }).click();
    await dialog.waitFor({ state: "hidden", timeout: 15_000 });
  }

  /** The Deleted Cases view (owners and admins), reached from the Cases list. */
  async openDeletedCases(): Promise<void> {
    await this.goto("/cases");
    // A Base UI Button rendered as a link (`nativeButton={false}`) carries role=button.
    await this.page
      .getByRole("link", { name: "Deleted Cases" })
      .or(this.page.getByRole("button", { name: "Deleted Cases" }))
      .first()
      .click();
    await this.page.waitForURL(/\/deleted-cases$/, {
      timeout: 15_000,
    });
  }

  /** A row of the Deleted Cases view. */
  /** A Deleted Cases row; scoped to the page content, since a toast is a listitem naming the Case too. */
  deletedRowFor(name: string): Locator {
    return this.page
      .getByRole("main")
      .getByRole("listitem")
      .filter({ hasText: name });
  }
}
