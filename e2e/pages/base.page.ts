import type { Page } from "@playwright/test";

import { waitForHydrated } from "../support/hydration";

export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await waitForHydrated(this.page);
  }
}
