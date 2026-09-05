import { APIError } from "better-auth/api";
import { describe, expect, it, vi } from "vitest";

import {
  assertPasswordLength,
  requirePendingInvitation,
  throwInvitationNotFound,
} from "@/auth/invite-signup-helpers";

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
      const invitation = {
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
      };
      const adapter = {
        findInvitationById: vi.fn().mockResolvedValue(invitation),
      };

      await expect(
        requirePendingInvitation(adapter as never, "inv-1")
      ).resolves.toBe(invitation);
    });

    it("rejects missing, non-pending, or expired invitations", async () => {
      const adapter = {
        findInvitationById: vi.fn(),
      };

      adapter.findInvitationById.mockResolvedValue(null);
      await expect(
        requirePendingInvitation(adapter as never, "missing")
      ).rejects.toBeInstanceOf(APIError);

      adapter.findInvitationById.mockResolvedValue({
        status: "accepted",
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(
        requirePendingInvitation(adapter as never, "accepted")
      ).rejects.toBeInstanceOf(APIError);

      adapter.findInvitationById.mockResolvedValue({
        status: "pending",
        expiresAt: new Date(Date.now() - 1),
      });
      await expect(
        requirePendingInvitation(adapter as never, "expired")
      ).rejects.toBeInstanceOf(APIError);
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
