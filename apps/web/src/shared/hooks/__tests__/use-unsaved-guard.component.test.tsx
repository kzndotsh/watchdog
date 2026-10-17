import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useUnsavedGuard } from "@/shared/hooks/use-unsaved-guard";
import { UnsavedChangesDialog } from "@/shared/ui/unsaved-changes-dialog";
import {
  createTestRouter,
  destroyTestRouter,
  testRouterWrapper,
} from "@/testing/test-router";

/** A draft field that is dirty while it differs from the last saved value. */
function DraftProbe() {
  const [saved, setSaved] = useState("");
  const [draft, setDraft] = useState("");
  const guard = useUnsavedGuard(draft !== saved);
  return (
    <>
      <input
        aria-label="Draft"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
      <button
        type="button"
        onClick={() => {
          setSaved(draft);
        }}
      >
        Save
      </button>
      <UnsavedChangesDialog guard={guard} subject="your draft" />
    </>
  );
}

const routers: ReturnType<typeof createTestRouter>[] = [];

function renderProbe(history: "memory" | "browser" = "memory") {
  const router = createTestRouter(history);
  routers.push(router);
  render(<DraftProbe />, { wrapper: testRouterWrapper(router) });
  return router;
}

function pathname(router: ReturnType<typeof createTestRouter>) {
  return router.history.location.pathname;
}

/** Fires `beforeunload` the way the browser does and reports whether the page asked to stay. */
function closeTab() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  // Browser history listens on window; leaving it behind would warn other files' unloads.
  for (const router of routers.splice(0)) destroyTestRouter(router);
});

describe("useUnsavedGuard", () => {
  it("lets a clean form navigate without asking", async () => {
    const router = renderProbe();

    router.history.push("/elsewhere");

    await waitFor(() => {
      expect(pathname(router)).toBe("/elsewhere");
    });
    expect(
      screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" })
    ).not.toBeInTheDocument();
  });

  it("asks before leaving a dirty form and keeps the draft on Keep Editing", async () => {
    const user = userEvent.setup();
    const router = renderProbe();
    await user.type(screen.getByLabelText("Draft"), "half a thought");

    router.history.push("/elsewhere");

    expect(
      await screen.findByRole("alertdialog", {
        name: "Discard unsaved changes?",
      })
    ).toHaveTextContent("Leaving this page discards your draft.");
    expect(pathname(router)).toBe("/");

    await user.click(screen.getByRole("button", { name: "Keep Editing" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" })
      ).not.toBeInTheDocument();
    });
    expect(pathname(router)).toBe("/");
    expect(screen.getByLabelText("Draft")).toHaveValue("half a thought");

    // Cancelling does not disarm the guard: the next attempt asks again.
    router.history.push("/elsewhere");
    expect(
      await screen.findByRole("alertdialog", {
        name: "Discard unsaved changes?",
      })
    ).toBeInTheDocument();
  });

  it("navigates when the user discards the changes", async () => {
    const user = userEvent.setup();
    const router = renderProbe();
    await user.type(screen.getByLabelText("Draft"), "scratch");
    router.history.push("/elsewhere");

    await user.click(
      await screen.findByRole("button", { name: "Discard Changes" })
    );

    await waitFor(() => {
      expect(pathname(router)).toBe("/elsewhere");
    });
  });

  it("stops asking once the draft is saved", async () => {
    const user = userEvent.setup();
    const router = renderProbe();
    await user.type(screen.getByLabelText("Draft"), "kept");
    await user.click(screen.getByRole("button", { name: "Save" }));

    router.history.push("/elsewhere");

    await waitFor(() => {
      expect(pathname(router)).toBe("/elsewhere");
    });
    expect(
      screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" })
    ).not.toBeInTheDocument();
  });

  it("treats a draft typed back to the saved value as clean", async () => {
    const user = userEvent.setup();
    const router = renderProbe();
    await user.type(screen.getByLabelText("Draft"), "x");
    await user.clear(screen.getByLabelText("Draft"));

    router.history.push("/elsewhere");

    await waitFor(() => {
      expect(pathname(router)).toBe("/elsewhere");
    });
  });

  it("warns before the tab closes only while the form is dirty", async () => {
    const user = userEvent.setup();
    renderProbe("browser");

    expect(closeTab()).toBe(false);

    await user.type(screen.getByLabelText("Draft"), "unsaved");
    expect(closeTab()).toBe(true);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(closeTab()).toBe(false);
  });
});
