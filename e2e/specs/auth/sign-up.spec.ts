import { expect, test } from "../../fixtures/test";

test.describe("Auth", () => {
  test(
    "sign-up leaves auth and lands in the app shell",
    { tag: "@smoke" },
    async ({ authPage, page }) => {
      const stamp = `${Date.now()}`;
      await authPage.signUp(stamp);
      await expect(page).not.toHaveURL(/\/auth\//);
      await expect(page.locator("html[data-hydrated=true]")).toBeAttached();
    }
  );
});
