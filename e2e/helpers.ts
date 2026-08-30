import { expect, type Page } from "@playwright/test";

import { e2eApiParsers } from "./parse-api";

async function waitForHydratedNode(
  page: Page,
  selector: string
): Promise<void> {
  await page.waitForSelector("html[data-hydrated=true]", { timeout: 30_000 });
  await page.locator(selector).waitFor({ timeout: 30_000 });
}

export async function signUp(page: Page, stamp: string): Promise<void> {
  const email = `e2e.${stamp}@mailhost.test`;
  const signupPass = process.env.E2E_SIGNUP_PASS ?? "E2e-passw0rd-long";
  await page.goto("/auth/sign-up");
  await waitForHydratedNode(page, "#email");
  await page.locator("#name").fill("E2E Investigator");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(signupPass);
  const confirm = page.locator("#confirmPassword");
  if (await confirm.count()) {
    await confirm.fill(signupPass);
  }
  await page.getByRole("button", { name: /^sign up$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/"), {
    timeout: 30_000,
  });
}

export async function createCase(page: Page, name: string): Promise<void> {
  await page.goto("/cases");
  await page.waitForSelector("html[data-hydrated=true]", { timeout: 30_000 });
  const trigger = page.getByRole("button", { name: "New Case" }).first();
  await trigger.waitFor({ timeout: 30_000 });
  await trigger.click();
  const dialog = page.locator("[data-slot=alert-dialog-content]");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.locator("#new-case-title").fill(name);
  await dialog.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
}

export async function dumpPasteViaUi(page: Page, body: string): Promise<void> {
  await page.goto("/collect");
  await page.waitForSelector("html[data-hydrated=true]", { timeout: 30_000 });
  await page.getByRole("button", { name: "Paste" }).first().click();
  await page
    .getByPlaceholder("Paste page text, tool output, notes…")
    .fill(body);
  await page.getByRole("button", { name: /add evidence/i }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });
}

export { e2eApiParsers } from "./parse-api";

type ApiJsonParser<T> = (json: unknown) => T;

export async function apiJson<T>(
  page: Page,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  parse?: ApiJsonParser<T>
): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json" },
    data: body,
  });
  if (!response.ok()) {
    throw new Error(
      `${method} ${path} failed: ${response.status()} ${await response.text()}`
    );
  }
  const json: unknown = await response.json();
  if (parse) return parse(json);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- callers without parse name the contract type
  return json as T;
}

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
  await signUp(page, stamp);
  await createCase(page, caseName);

  const cases = await apiJson(
    page,
    "GET",
    "/cases",
    undefined,
    e2eApiParsers.caseList
  );
  const cased = cases.find((row) => row.name === caseName);
  expect(cased).toBeDefined();
  if (cased === undefined) throw new Error("case not created");

  return { stamp, caseId: cased.id, caseName };
}
