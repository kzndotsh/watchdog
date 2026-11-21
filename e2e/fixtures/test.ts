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

/**
 * One `securitypolicyviolation` event, as the page reports it. Every spec fails on any: the
 * policy is the production one apart from `<style>` elements (see `security-headers.server.ts`),
 * so a screen that needs an exception shows up here first.
 */
type CspViolation = {
  directive: string;
  blocked: string;
  sample: string;
  source: string;
  line: number;
  url: string;
};

type E2eFixtures = {
  _cspViolations: null;
  _resetDb: null;
  api: E2eApi;
  authenticatedCase: AuthenticatedCase;
  authPage: AuthPage;
  casesPage: CasesPage;
  collectPage: CollectPage;
  triagePage: TriagePage;
  identifiersPage: IdentifiersPage;
};

export const test = base.extend<E2eFixtures>({
  _cspViolations: [
    async ({ page }, use) => {
      const violations: CspViolation[] = [];
      await page.exposeBinding(
        "__wdCspViolation",
        (_source, violation: CspViolation) => {
          violations.push(violation);
        }
      );
      await page.addInitScript(() => {
        // oxlint-disable-next-line unicorn/consistent-function-scoping -- addInitScript serializes only this function into the page: an outer helper would not exist there
        function isReporter(
          value: unknown
        ): value is (violation: CspViolation) => void {
          return typeof value === "function";
        }
        document.addEventListener("securitypolicyviolation", (event) => {
          const report: unknown = Reflect.get(window, "__wdCspViolation");
          if (!isReporter(report)) return;
          report({
            directive: event.effectiveDirective,
            blocked: event.blockedURI,
            sample: event.sample,
            source: event.sourceFile,
            line: event.lineNumber,
            url: location.pathname,
          });
        });
      });
      await use(null);
      expect(violations, "Content Security Policy violations").toEqual([]);
    },
    { auto: true },
  ],
  _resetDb: [
    async ({ page }, use) => {
      await resetE2eDb();
      // Stale session cookies point at wiped auth rows → shell 403s without New Case.
      await page.context().clearCookies();
      await use(null);
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
