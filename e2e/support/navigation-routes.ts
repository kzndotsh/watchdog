import { expect, type Page } from "@playwright/test";

export type RouteSmoke = {
  /**
   * The route pattern. A Work screen names its Case in the URL: `$caseSlug` stands for
   * the signed-in user's Case (see `routeUrl`). The pattern is also the axe key.
   */
  path: string;
  /** Also scan the loaded route with axe (serious and critical only). */
  axe?: boolean;
  ready: (page: Page) => Promise<void>;
};

/** The URL to open for a route, with the Case slug filled in. */
export function routeUrl(route: RouteSmoke, caseSlug: string): string {
  return route.path.replace("$caseSlug", encodeURIComponent(caseSlug));
}

export const primaryRoutes: RouteSmoke[] = [
  {
    path: "/",
    axe: true,
    ready: async (page) => {
      await expect(page.getByText("Proposals pending")).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    path: "/cases",
    axe: true,
    ready: async (page) => {
      await expect(
        page.getByRole("button", { name: "New Case" }).first()
      ).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    path: "/cases/$caseSlug/collect",
    axe: true,
    ready: async (page) => {
      await expect(
        page.getByRole("button", { name: "Paste" }).first()
      ).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    path: "/cases/$caseSlug/triage",
    axe: true,
    ready: async (page) => {
      await expect(page.locator("main").last()).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    path: "/cases/$caseSlug/entities",
    ready: async (page) => {
      await expect(page.locator("main").last()).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    path: "/cases/$caseSlug/identifiers",
    ready: async (page) => {
      await expect(
        page.getByRole("button", { name: /add identifier/i }).first()
      ).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    path: "/cases/$caseSlug/graph",
    ready: async (page) => {
      await expect(page.locator("main").last()).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    path: "/cases/$caseSlug/tasks",
    ready: async (page) => {
      await expect(page.getByRole("button", { name: /new task/i })).toBeVisible(
        {
          timeout: 30_000,
        }
      );
    },
  },
  {
    path: "/deleted-cases",
    ready: async (page) => {
      await expect(page.getByText("No Deleted Cases")).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    path: "/settings",
    axe: true,
    ready: async (page) => {
      await expect(page.getByText("Account").first()).toBeVisible({
        timeout: 30_000,
      });
    },
  },
];
