import { expect, type Page } from "@playwright/test";

import { E2eApi } from "../api/client";
import { AuthPage } from "../pages/auth.page";
import { CasesPage } from "../pages/cases.page";

export interface AuthenticatedCase {
  stamp: string;
  caseId: string;
  caseName: string;
}

export async function setupAuthenticatedCase(
  page: Page,
  namePrefix: string
): Promise<AuthenticatedCase> {
  const stamp = `${Date.now()}`;
  const caseName = `${namePrefix} ${stamp}`;
  const auth = new AuthPage(page);
  const cases = new CasesPage(page);

  await auth.signUp(stamp);
  await cases.createCase(caseName);

  const api = new E2eApi(page);
  const caseRows = await api.listCases();
  const activeCase = caseRows.find((row) => row.name === caseName);
  expect(activeCase).toBeDefined();
  if (activeCase === undefined) throw new Error("case not created");

  return { stamp, caseId: activeCase.id, caseName };
}
