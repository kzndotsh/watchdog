import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const authFetch = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({ authClient: { $fetch: authFetch } }));

vi.mock("@better-auth-ui/react", () => ({
  useAuth: () => ({
    localization: { settings: { optional: "Optional", cancel: "Cancel" } },
  }),
  useAuthPlugin: () => ({
    localization: {
      createApiKey: "Create API key",
      apiKeysDescription: "Keys for agents",
      name: "Name",
      newApiKey: "New key",
      newApiKeyWarning: "Store it",
      apiKey: "API key",
      dismissNewKey: "Dismiss",
    },
  }),
  useSession: () => ({
    data: { user: { id: "u1" }, session: { activeOrganizationId: "org-1" } },
    isPending: false,
  }),
}));

import { CreateApiKeyDialog } from "@/auth/ui/api-key/create-api-key-dialog";

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateApiKeyDialog open onOpenChange={vi.fn()} />
    </QueryClientProvider>
  );
}

function switchOf(name: string) {
  return screen.getByRole("switch", { name });
}

describe("CreateApiKeyDialog", () => {
  it("starts on the Agent preset: read and propose", () => {
    renderDialog();

    expect(switchOf("Read cases")).toBeChecked();
    expect(switchOf("Propose changes")).toBeChecked();
    expect(switchOf("Collect evidence")).not.toBeChecked();
    expect(switchOf("Write the Graph")).not.toBeChecked();
    expect(switchOf("Read cases")).toHaveAttribute("aria-disabled", "true");
  });

  it("sets the toggles from each preset", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Collector" }));
    expect(switchOf("Collect evidence")).toBeChecked();
    expect(switchOf("Propose changes")).toBeChecked();
    expect(switchOf("Write the Graph")).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Full" }));
    expect(switchOf("Write the Graph")).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Agent" }));
    expect(switchOf("Collect evidence")).not.toBeChecked();
    expect(switchOf("Write the Graph")).not.toBeChecked();
  });

  it("sends exactly the chosen scopes and shows the key once", async () => {
    authFetch.mockResolvedValue({
      data: { id: "k1", name: "ci", key: "wd_secret" },
      error: null,
    });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Name"), "ci");
    await user.click(switchOf("Collect evidence"));
    await user.click(switchOf("Propose changes"));
    await user.click(screen.getByRole("button", { name: "Create API key" }));

    await waitFor(() => {
      expect(authFetch).toHaveBeenCalledWith("/api-key/create-scoped", {
        method: "POST",
        body: { name: "ci", scopes: ["cases:read", "evidence:write"] },
      });
    });
    expect(await screen.findByDisplayValue("wd_secret")).toBeInTheDocument();
  });

  it("says the key could not be created when the server refuses", async () => {
    authFetch.mockResolvedValue({
      data: null,
      error: { status: 400, message: "Bad request" },
    });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Create API key" }));

    expect(
      await screen.findByText(/Bad request|Couldn't create/)
    ).toBeVisible();
  });
});
