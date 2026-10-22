import { fireEvent, render, screen } from "@testing-library/react";
import { KeyRoundIcon, ShieldIcon } from "lucide-react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  SettingsShell,
  type SettingsNavItem,
} from "@/domains/settings/components/settings-shell";
import { SidebarProvider } from "@watchdog/ui/components/sidebar";

/** The nav rows are the sidebar's own buttons, which read the sidebar context. */
function renderShell(ui: ReactElement) {
  return render(ui, { wrapper: SidebarProvider });
}

const ITEMS: SettingsNavItem[] = [
  {
    id: "account",
    group: "Personal",
    label: "Account",
    description: "Profile and identity settings.",
    icon: ShieldIcon,
  },
  {
    id: "credentials",
    group: "Organization",
    label: "Credentials",
    description: "Cap provider secrets stored in the vault.",
    icon: KeyRoundIcon,
  },
];

describe("SettingsShell", () => {
  it("renders the active section heading and child content", () => {
    renderShell(
      <SettingsShell items={ITEMS} activeTab="account" onTabChange={vi.fn()}>
        <div>Account panel</div>
      </SettingsShell>
    );

    expect(
      screen.getByRole("heading", { name: "Account" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Profile and identity settings.")
    ).toBeInTheDocument();
    expect(screen.getByText("Account panel")).toBeInTheDocument();
  });

  it("shows a heading for each nav group", () => {
    renderShell(
      <SettingsShell items={ITEMS} activeTab="account" onTabChange={vi.fn()}>
        <div>Panel</div>
      </SettingsShell>
    );

    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Organization")).toBeInTheDocument();
  });

  it("calls onTabChange when a nav item is selected", () => {
    const onTabChange = vi.fn();

    renderShell(
      <SettingsShell
        items={ITEMS}
        activeTab="account"
        onTabChange={onTabChange}
      >
        <div>Panel</div>
      </SettingsShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "Credentials" }));
    expect(onTabChange).toHaveBeenCalledWith("credentials");
  });
});
