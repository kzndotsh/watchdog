import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const listUsers = vi.hoisted(() => vi.fn());
const banUser = vi.hoisted(() => vi.fn());
const unbanUser = vi.hoisted(() => vi.fn());
const revokeUserSessions = vi.hoisted(() => vi.fn());
const useSession = vi.hoisted(() => vi.fn());

vi.mock("@better-auth-ui/react", () => ({
  useSession: (...args: unknown[]) => useSession(...args),
}));

vi.mock("@/auth/client", () => ({
  authClient: {
    admin: {
      listUsers,
      banUser,
      unbanUser,
      revokeUserSessions,
      impersonateUser: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { UsersSettings } from "@/auth/ui/users/users-settings";

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("UsersSettings", () => {
  it("lists users without Impersonate and without actions on self", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "u-admin", email: "admin@mailhost.test", role: "admin" } },
    });
    listUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: "u-admin",
            name: "Admin",
            email: "admin@mailhost.test",
            role: "admin",
            banned: false,
          },
          {
            id: "u-other",
            name: "Other",
            email: "other@mailhost.test",
            role: "user",
            banned: false,
          },
        ],
      },
      error: null,
    });

    render(wrap(<UsersSettings />));

    expect(await screen.findByText("admin@mailhost.test · Install admin")).toBeInTheDocument();
    expect(screen.getByText("other@mailhost.test · User")).toBeInTheDocument();
    expect(screen.queryByText("Impersonate")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Actions for admin@mailhost.test")
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Actions for other@mailhost.test")
    ).toBeInTheDocument();
  });

  it("offers Disable and Sign out all sessions for other users", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "u-admin", role: "admin" } },
    });
    listUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: "u-other",
            name: "Other",
            email: "other@mailhost.test",
            role: "user",
            banned: false,
          },
        ],
      },
      error: null,
    });

    const user = userEvent.setup();
    render(wrap(<UsersSettings />));
    await user.click(
      await screen.findByLabelText("Actions for other@mailhost.test")
    );

    expect(screen.getByRole("menuitem", { name: "Disable" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Sign out all sessions" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Impersonate" })).not.toBeInTheDocument();
  });
});
