import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";

import {
  type PendingInvitation,
  assertPasswordLength,
  requirePendingInvitation,
  throwInvitationNotFound,
} from "../invite-signup-helpers";

function invitationRow(
  overrides: Partial<PendingInvitation> = {}
): PendingInvitation {
  return {
    id: "inv-1",
    organizationId: "org-1",
    email: "invitee@mailhost.test",
    role: "member",
    status: "pending",
    inviterId: "user-1",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ...overrides,
  };
}

/** The one adapter call the helper makes, answering from a fixed row (or none). */
function adapterFor(invitation: PendingInvitation | null) {
  return { findInvitationById: async () => invitation };
}

describe("invite-signup-helpers", () => {
  describe("throwInvitationNotFound", () => {
    it("throws a BAD_REQUEST invitation-not-found error", () => {
      expect(() => throwInvitationNotFound()).toThrow(APIError);
      try {
        throwInvitationNotFound();
      } catch (error) {
        expect(error).toMatchObject({
          status: "BAD_REQUEST",
          body: expect.objectContaining({ code: "INVITATION_NOT_FOUND" }),
        });
      }
    });
  });

  describe("requirePendingInvitation", () => {
    it("returns a pending, unexpired invitation", async () => {
      const invitation = invitationRow();

      await expect(
        requirePendingInvitation(adapterFor(invitation), "inv-1")
      ).resolves.toBe(invitation);
    });

    it.each([
      ["missing", null],
      ["accepted", invitationRow({ status: "accepted" })],
      ["expired", invitationRow({ expiresAt: new Date(Date.now() - 1) })],
    ])("rejects a %s invitation as not found", async (_label, row) => {
      await expect(
        requirePendingInvitation(adapterFor(row), "inv-1")
      ).rejects.toMatchObject({
        status: "BAD_REQUEST",
        body: expect.objectContaining({ code: "INVITATION_NOT_FOUND" }),
      });
    });
  });

  describe("assertPasswordLength", () => {
    const config = { minPasswordLength: 8, maxPasswordLength: 12 };

    it("accepts passwords within bounds", () => {
      expect(() => assertPasswordLength("abcdefgh", config)).not.toThrow();
      expect(() => assertPasswordLength("abcdefghijkl", config)).not.toThrow();
    });

    it("rejects short and long passwords", () => {
      expect(() => assertPasswordLength("short", config)).toThrow(APIError);
      expect(() => assertPasswordLength("abcdefghijklm", config)).toThrow(
        APIError
      );
    });
  });
});
