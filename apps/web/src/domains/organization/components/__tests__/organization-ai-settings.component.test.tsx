import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the network boundary is faked; the query, the mutation and the cache write run
// for real under a real QueryClient.
vi.mock("@/domains/organization/organization-settings.functions", () => ({
  getOrganizationSettingsFn: vi.fn(),
  updateOrganizationSettingsFn: vi.fn(),
}));

import { OrganizationAiSettings } from "@/domains/organization/components/organization-ai-settings";
import {
  getOrganizationSettingsFn,
  updateOrganizationSettingsFn,
} from "@/domains/organization/organization-settings.functions";

function renderSettings(canEdit: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OrganizationAiSettings canEdit={canEdit} />
    </QueryClientProvider>
  );
}

describe("OrganizationAiSettings", () => {
  beforeEach(() => {
    vi.mocked(getOrganizationSettingsFn).mockResolvedValue({
      externalAiHandoff: true,
    });
    vi.mocked(updateOrganizationSettingsFn).mockResolvedValue({
      externalAiHandoff: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("turns the handoff off for an owner or admin", async () => {
    const user = userEvent.setup();
    renderSettings(true);
    const toggle = await screen.findByRole("switch");
    await waitFor(() => {
      expect(toggle).toBeEnabled();
    });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    await waitFor(() => {
      expect(updateOrganizationSettingsFn).toHaveBeenCalledWith({
        data: { externalAiHandoff: false },
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("switch")).not.toBeChecked();
    });
  });

  it("is read-only for a member", async () => {
    renderSettings(false);
    const toggle = await screen.findByRole("switch");

    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("Ask an owner or admin to change this.")
    ).toBeInTheDocument();
  });
});
