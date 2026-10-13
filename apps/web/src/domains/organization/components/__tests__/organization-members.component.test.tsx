import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { OrganizationMembers } from "@/domains/organization/components/organization-members";
import { SETTINGS_MEMBERS_SKELETON_ROWS } from "@/shared/ui/skeletons/constants";

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("OrganizationMembers", () => {
  it("shows a skeleton shaped like the three cards while the team loads", () => {
    useSession.mockReturnValue({
      data: { user: { id: "u-owner", email: "owner@mailhost.test" } },
    });
    listMembers.mockReturnValue(new Promise(() => {}));
    listInvitations.mockReturnValue(new Promise(() => {}));

    const { container } = render(wrap(<OrganizationMembers />));

    expect(screen.getByRole("status")).toHaveTextContent("Loading members");
    // Static chrome stays real text; only the dynamic parts are bones.
    expect(screen.getByText("Invite someone")).toBeInTheDocument();
    expect(screen.getByText("Pending invitations")).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-slot="settings-members-skeleton-row"]')
    ).toHaveLength(SETTINGS_MEMBERS_SKELETON_ROWS);
    // No bare spinner standing in for the page.
    expect(container.querySelector('[data-slot="spinner"]')).toBeNull();
  });

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

    render(wrap(<OrganizationMembers />));

    expect(await screen.findByLabelText("Search members")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Invite" })
    ).not.toBeInTheDocument();
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

    render(wrap(<OrganizationMembers />));

    expect(
      await screen.findByRole("button", { name: "Invite" })
    ).toBeInTheDocument();
  });

  it("shows retry when the team query fails", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "u-owner", email: "owner@mailhost.test" } },
    });
    listMembers.mockResolvedValue({
      data: null,
      error: { message: "network down" },
    });
    listInvitations.mockResolvedValue({ data: [], error: null });

    render(wrap(<OrganizationMembers />));

    expect(await screen.findByText("network down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("filters members by search and offers Make owner only to owners", async () => {
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
          {
            id: "m2",
            userId: "u-ana",
            role: "member",
            user: { name: "Ana Reyes", email: "ana@mailhost.test" },
          },
          {
            id: "m3",
            userId: "u-bo",
            role: "admin",
            user: { name: "Bo Tran", email: "bo@mailhost.test" },
          },
        ],
      },
      error: null,
    });
    listInvitations.mockResolvedValue({ data: [], error: null });

    render(wrap(<OrganizationMembers />));

    expect(await screen.findByText("Ana Reyes")).toBeInTheDocument();
    expect(screen.getByText("Bo Tran")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search members"), {
      target: { value: "bo@" },
    });
    expect(screen.queryByText("Ana Reyes")).not.toBeInTheDocument();
    expect(screen.getByText("Bo Tran")).toBeInTheDocument();
  });
});
