import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NewApiKeyDialog } from "@/auth/ui/api-key/new-api-key-dialog";

vi.mock("@better-auth-ui/react", () => ({
  useAuth: () => ({ localization: { settings: { copyToClipboard: "Copy" } } }),
  useAuthPlugin: () => ({
    localization: {
      newApiKey: "New key",
      newApiKeyWarning: "Store it",
      apiKey: "API key",
      dismissNewKey: "Dismiss",
    },
  }),
}));

function renderDialog() {
  return render(
    <NewApiKeyDialog
      open
      onOpenChange={vi.fn()}
      name="ci"
      secretKey="sk-secret"
    />
  );
}

const COPY_FEEDBACK_MS = 1500;

function copyFeedbackCalls(spy: {
  mock: { calls: Parameters<typeof window.setTimeout>[] };
}) {
  return spy.mock.calls.filter(([, delay]) => delay === COPY_FEEDBACK_MS);
}

describe("NewApiKeyDialog copy feedback", () => {
  afterEach(() => {
    // Order matters: spies on window.setTimeout / cancelAnimationFrame are
    // created while fake timers are installed, so their "original" is the
    // fake. Restoring them after useRealTimers() would reinstall the fake
    // timers for every later file in this shared worker (5s waitFor hangs).
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears the feedback timer when unmounted after copying", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const setSpy = vi.spyOn(window, "setTimeout");
    const clearSpy = vi.spyOn(window, "clearTimeout");
    const { unmount } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    const [timerCall] = copyFeedbackCalls(setSpy);
    expect(timerCall).toBeDefined();
    const timerId = setSpy.mock.results[setSpy.mock.calls.indexOf(timerCall)]
      ?.value as number;
    unmount();
    expect(clearSpy).toHaveBeenCalledWith(timerId);
  });

  it("schedules nothing when the clipboard write resolves after unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // observed below
    });
    let resolveWrite: () => void = () => {
      throw new Error("write not started");
    };
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: {
        writeText: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveWrite = resolve;
            })
        ),
      },
    });
    const setSpy = vi.spyOn(window, "setTimeout");
    const { unmount } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    unmount();
    resolveWrite();
    await Promise.resolve();
    await Promise.resolve();
    expect(copyFeedbackCalls(setSpy)).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
