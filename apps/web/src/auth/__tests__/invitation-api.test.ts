import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({
  authClient: {
    $fetch: fetchMock,
  },
}));

import { fetchInvitationPreview, inviteSignUp } from "@/auth/invitation-api";

describe("invitation-api", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("returns invitation preview data", async () => {
    const preview = {
      id: "inv-1",
      email: "invitee@mailhost.test",
      role: "member",
      organizationName: "Watchdog",
    };
    fetchMock.mockResolvedValue({ data: preview, error: null });

    await expect(fetchInvitationPreview("inv-1")).resolves.toEqual(preview);
    expect(fetchMock).toHaveBeenCalledWith("/organization/invitation-preview", {
      method: "GET",
      query: { id: "inv-1" },
    });
  });

  it("throws when invitation preview is missing", async () => {
    fetchMock.mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });

    await expect(fetchInvitationPreview("missing")).rejects.toThrow(
      "not found"
    );
  });

  it("posts invite sign-up payload", async () => {
    fetchMock.mockResolvedValue({ data: null, error: null });

    await inviteSignUp({
      invitationId: "inv-1",
      name: "Ada",
      password: "correct-horse",
    });

    expect(fetchMock).toHaveBeenCalledWith("/organization/invite-sign-up", {
      method: "POST",
      body: {
        invitationId: "inv-1",
        name: "Ada",
        password: "correct-horse",
      },
    });
  });

  it("throws when invite sign-up fails", async () => {
    fetchMock.mockResolvedValue({
      data: null,
      error: { statusText: "forbidden" },
    });

    await expect(
      inviteSignUp({
        invitationId: "inv-1",
        name: "Ada",
        password: "correct-horse",
      })
    ).rejects.toThrow("forbidden");
  });
});
