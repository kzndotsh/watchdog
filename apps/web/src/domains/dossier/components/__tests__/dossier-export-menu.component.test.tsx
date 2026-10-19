// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"enableIframePageLoading":true}}
// happy-dom 21 does not load iframe pages by default (SSRF hardening), so `contentWindow` is
// null; `fakeTab` below needs a real iframe Window and loads nothing, so only this file opts in.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

// Only the network boundary is faked: the two `*.functions` modules and the Markdown
// export request. The menu, the hook, the dialog and the settings query run for real
// under a real QueryClient (docs/contributing/testing/standards.md Mock policy).
vi.mock("@/domains/organization/organization-settings.functions", () => ({
  getOrganizationSettingsFn: vi.fn(),
  updateOrganizationSettingsFn: vi.fn(),
}));

vi.mock("@/domains/entities/entities.functions", () => ({
  recordAiHandoffFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { DossierExportMenu } from "@/domains/dossier/components/dossier-export-menu";
import { recordAiHandoffFn } from "@/domains/entities/entities.functions";
import { getOrganizationSettingsFn } from "@/domains/organization/organization-settings.functions";
import { toast } from "@/shared/ui/toast";

const CASE_ID = testId(10);
const MARKDOWN = "# Ada Lovelace\n\nAnalyst.";

function renderMenu() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DossierExportMenu
        caseId={CASE_ID}
        entitySlug="ada-lovelace"
        entityName="Ada Lovelace"
      />
    </QueryClientProvider>
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Copy" }));
}

/**
 * A real Window (an iframe's) standing in for the new tab: `window.open` hands it back,
 * and where it is sent and whether it closed are spied, so nothing navigates.
 */
function fakeTab() {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const window = frame.contentWindow;
  if (window === null) throw new Error("The iframe has no window");
  // happy-dom makes `opener` getter-only; browsers let a page null it, as the handoff does.
  Object.defineProperty(window, "opener", {
    value: globalThis.window,
    writable: true,
  });
  return {
    window,
    load: vi.spyOn(window.location, "replace").mockImplementation(() => {}),
    close: vi.spyOn(window, "close").mockImplementation(() => {}),
    remove: () => {
      frame.remove();
    },
  };
}

describe("DossierExportMenu", () => {
  let openSpy: ReturnType<typeof vi.spyOn>;
  let tab: ReturnType<typeof fakeTab>;

  beforeEach(() => {
    vi.mocked(getOrganizationSettingsFn).mockResolvedValue({
      externalAiHandoff: true,
    });
    vi.mocked(recordAiHandoffFn).mockResolvedValue({ ok: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(MARKDOWN, { status: 200 }))
    );
    tab = fakeTab();
    openSpy = vi.spyOn(window, "open").mockImplementation(() => tab.window);
  });

  afterEach(() => {
    openSpy.mockRestore();
    tab.remove();
    vi.clearAllMocks();
  });

  it("renders the copy export trigger", () => {
    renderMenu();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("names the destination, the Entity and the size before anything leaves", async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Open in Claude" })
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Send Ada Lovelace to Claude?");
    expect(dialog).toHaveTextContent(`${MARKDOWN.length} characters (0.0 KB)`);
    expect(recordAiHandoffFn).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("records the handoff, then opens the chat, when confirmed", async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Open in ChatGPT" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Send to ChatGPT" })
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Opened in ChatGPT");
    });
    expect(recordAiHandoffFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, slug: "ada-lovelace", destination: "chatgpt" },
    });
    expect(openSpy).toHaveBeenCalledExactlyOnceWith("about:blank", "_blank");
    expect(tab.window.opener).toBeNull();
    expect(tab.load).toHaveBeenCalledExactlyOnceWith(
      `https://chatgpt.com/?q=${encodeURIComponent(MARKDOWN)}`
    );
  });

  it("opens the tab in the click but loads the chat only once recorded", async () => {
    let loadedWhenRecorded: boolean | undefined;
    vi.mocked(recordAiHandoffFn).mockImplementation(async () => {
      loadedWhenRecorded = tab.load.mock.calls.length > 0;
      return { ok: true };
    });
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Open in Claude" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Send to Claude" })
    );

    await waitFor(() => {
      expect(recordAiHandoffFn).toHaveBeenCalledTimes(1);
    });
    expect(openSpy.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(recordAiHandoffFn).mock.invocationCallOrder[0] ?? 0
    );
    expect(loadedWhenRecorded).toBe(false);
    await waitFor(() => {
      expect(tab.load).toHaveBeenCalledTimes(1);
    });
  });

  it("neither records nor opens when cancelled", async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Open in Claude" })
    );
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(recordAiHandoffFn).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("does not open the chat when the handoff cannot be recorded", async () => {
    vi.mocked(recordAiHandoffFn).mockRejectedValue(
      new Error("External AI handoff is turned off for this organization")
    );
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Open in Claude" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Send to Claude" })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "External AI handoff is turned off for this organization"
      );
    });
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.load).not.toHaveBeenCalled();
  });

  it("reports a blocked tab instead of claiming the chat opened", async () => {
    openSpy.mockImplementation(() => null);
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Open in Claude" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Send to Claude" })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Your browser blocked the new tab. Allow pop-ups for Watchdog and send again."
      );
    });
    expect(recordAiHandoffFn).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    // The confirmation stays up so the user can allow pop-ups and send again.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("hides the handoff when the organization turned it off", async () => {
    vi.mocked(getOrganizationSettingsFn).mockResolvedValue({
      externalAiHandoff: false,
    });
    const user = userEvent.setup();
    renderMenu();
    await waitFor(() => {
      expect(getOrganizationSettingsFn).toHaveBeenCalled();
    });
    await openMenu(user);

    expect(
      await screen.findByRole("menuitem", { name: "Copy as Markdown" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Open in Claude" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Open in ChatGPT" })
    ).not.toBeInTheDocument();
  });
});
