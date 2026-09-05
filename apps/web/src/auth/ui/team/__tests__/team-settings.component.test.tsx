import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const listMembers = vi.hoisted(() => vi.fn());
const listInvitations = vi.hoisted(() => vi.fn());
const useSession = vi.hoisted(() => vi.fn());

vi.mock("@better-auth-ui/react", () => ({
  useSession: (...args: unknown[]) => useSession(...args),
}));

vi.mock("@/auth/client", () => ({
  authClient: {
    organization: {
      listMembers,
      listInvitations,
      inviteMember: vi.fn(),
      cancelInvitation: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { TeamSettings } from "@/auth/ui/team/team-settings";

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("TeamSettings", () => {
  it("hides the invite form for members", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "u-member", email: "member@mailhost.test" } },
    });
    listMembers.mockResolvedValue({
      data: {
        members: [
          {
            id: "m1",
            userId: "u-owner",
            role: "owner",
            user: { name: "Owner", email: "owner@mailhost.test" },
          },
          {
            id: "m2",
            userId: "u-member",
            role: "member",
            user: { name: "Member", email: "member@mailhost.test" },
          },
        ],
      },
      error: null,
    });
    listInvitations.mockResolvedValue({ data: [], error: null });

    render(wrap(<TeamSettings />));

    expect(await screen.findByText("Members")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("shows the invite form for owners", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "u-owner", email: "owner@mailhost.test" } },
    });
    listMembers.mockResolvedValue({
      data: {
        members: [
          {
            id: "m1",
            userId: "u-owner",
            role: "owner",
            user: { name: "Owner", email: "owner@mailhost.test" },
          },
        ],
      },
      error: null,
    });
    listInvitations.mockResolvedValue({ data: [], error: null });

    render(wrap(<TeamSettings />));

    expect(await screen.findByRole("button", { name: "Invite" })).toBeInTheDocument();
  });
});
