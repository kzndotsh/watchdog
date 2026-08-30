import { expect, type Page } from "@playwright/test";

export interface RouteSmoke {
  path: string;
  ready: (page: Page) => Promise<void>;
}

export const primaryRoutes: RouteSmoke[] = [
  {
    path: "/",
    ready: async (page) => {
      await expect(page.getByText("Proposals pending")).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    path: "/cases",
    ready: async (page) => {
      await expect(
        page.getByRole("button", { name: "New Case" }).first()
      ).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    path: "/collect",
    ready: async (page) => {
      await expect(
        page.getByRole("button", { name: "Paste" }).first()
      ).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    path: "/triage",
    ready: async (page) => {
      await expect(page.locator("main").last()).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    path: "/entities",
    ready: async (page) => {
      await expect(page.locator("main").last()).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    path: "/identifiers",
    ready: async (page) => {
      await expect(
        page.getByRole("button", { name: /add identifier/i })
      ).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    path: "/graph",
    ready: async (page) => {
      await expect(page.locator("main").last()).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    path: "/tasks",
    ready: async (page) => {
      await expect(page.getByRole("button", { name: /new task/i })).toBeVisible(
        {
          timeout: 30_000,
        }
      );
    },
  },
  {
    path: "/settings",
    ready: async (page) => {
      await expect(page.getByText("Account").first()).toBeVisible({
        timeout: 30_000,
      });
    },
  },
];
