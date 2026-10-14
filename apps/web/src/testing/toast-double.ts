import { vi } from "vitest";

/**
 * Module double for `@/shared/ui/toast`: a spy per helper, so a test asserts what the user
 * was told (`expect(toast.success).toHaveBeenCalledWith("Saved")`). Use it as
 *
 *   vi.mock("@/shared/ui/toast", async () => {
 *     const { toastModuleDouble } = await import("@/testing/toast-double");
 *     return toastModuleDouble();
 *   });
 *
 * and import `toast` from `@/shared/ui/toast` as the code under test does. A test that
 * needs the real toaster (it renders `<Toaster />` and reads the DOM) does not mock it.
 */
export const toastModuleDouble = () => ({
  Toaster: () => null,
  toast: {
    add: vi.fn(),
    close: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(async (promise: Promise<unknown>) => promise),
    success: vi.fn(),
    warning: vi.fn(),
  },
});
