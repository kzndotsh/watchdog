/* oxlint-disable react-hooks/rules-of-hooks -- Playwright fixture lifecycle callbacks are not React hooks. */
import { test as base, expect } from "@playwright/test";

import { E2eApi } from "../api/client";
import { AuthPage } from "../pages/auth.page";
import { CasesPage } from "../pages/cases.page";
import { CollectPage } from "../pages/collect.page";
import { IdentifiersPage } from "../pages/identifiers.page";
import { TriagePage } from "../pages/triage.page";
import { resetE2eDb } from "../support/db-reset";
import {
  setupAuthenticatedCase,
  type AuthenticatedCase,
} from "./authenticated-case";

interface E2eFixtures {
  api: E2eApi;
  authenticatedCase: AuthenticatedCase;
  authPage: AuthPage;
  casesPage: CasesPage;
  collectPage: CollectPage;
  triagePage: TriagePage;
  identifiersPage: IdentifiersPage;
}

export const test = base.extend<E2eFixtures>({
  _resetDb: [
    async ({ page: _page }, use) => {
      await resetE2eDb();
      // oxlint-disable-next-line typescript/no-unsafe-call -- Playwright fixture `use` is typed loosely
      await use();
    },
    { auto: true },
  ],
  api: async ({ page }, use) => {
    await use(new E2eApi(page));
  },
  authenticatedCase: async ({ page }, use) => {
    await use(await setupAuthenticatedCase(page, "E2E"));
  },
  authPage: async ({ page }, use) => {
    await use(new AuthPage(page));
  },
  casesPage: async ({ page }, use) => {
    await use(new CasesPage(page));
  },
  collectPage: async ({ page }, use) => {
    await use(new CollectPage(page));
  },
  triagePage: async ({ page }, use) => {
    await use(new TriagePage(page));
  },
  identifiersPage: async ({ page }, use) => {
    await use(new IdentifiersPage(page));
  },
});

export { expect };
