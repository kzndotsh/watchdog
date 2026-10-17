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

describe("DossierExportMenu", () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(getOrganizationSettingsFn).mockResolvedValue({
      externalAiHandoff: true,
    });
    vi.mocked(recordAiHandoffFn).mockResolvedValue({ ok: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(MARKDOWN, { status: 200 }))
    );
    openSpy = vi.spyOn(window, "open").mockImplementation(() => window);
  });

  afterEach(() => {
    openSpy.mockRestore();
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
      expect(openSpy).toHaveBeenCalledTimes(1);
    });
    expect(recordAiHandoffFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, slug: "ada-lovelace", destination: "chatgpt" },
    });
    expect(openSpy.mock.calls[0]?.[0]).toBe(
      `https://chatgpt.com/?q=${encodeURIComponent(MARKDOWN)}`
    );
    expect(
      vi.mocked(recordAiHandoffFn).mock.invocationCallOrder[0]
    ).toBeLessThan(openSpy.mock.invocationCallOrder[0] ?? 0);
    expect(toast.success).toHaveBeenCalledWith("Opened in ChatGPT");
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
    expect(openSpy).not.toHaveBeenCalled();
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
    expect(toast.success).not.toHaveBeenCalled();
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
