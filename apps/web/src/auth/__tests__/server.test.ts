import { describe, expect, it, vi } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

vi.mock("@better-auth/api-key", () => ({
  apiKey: vi.fn(() => ({ id: "api-key" })),
}));
vi.mock("@better-auth/drizzle-adapter", () => ({
  drizzleAdapter: vi.fn(() => ({})),
}));
vi.mock("better-auth", () => ({
  betterAuth: vi.fn((config: unknown) => ({ config, api: {}, $Infer: {} })),
}));
vi.mock("better-auth/plugins", () => ({
  organization: vi.fn(() => ({ id: "organization" })),
  admin: vi.fn(() => ({ id: "admin" })),
}));
vi.mock("better-auth/tanstack-start", () => ({
  tanstackStartCookies: vi.fn(() => ({ id: "tanstack-start-cookies" })),
}));
vi.mock("@watchdog/db", () => ({
  db: {},
  account: {},
  session: {},
  user: {},
  verification: {},
  apiKey: {},
  organization: {},
  member: {},
  invitation: {},
  bootstrapWatchdogOrganization: vi.fn(),
  onAuthSessionCreated: vi.fn(),
  resolveUserOrganizationId: vi.fn(),
}));
vi.mock("@/auth/invite-signup-plugin", () => ({
  inviteSignupPlugin: vi.fn(() => ({ id: "invite-signup" })),
}));
vi.mock("@/auth/send-invitation-email", () => ({
  sendInvitationEmail: vi.fn(),
}));
vi.mock("@watchdog/env/server", () => ({
  env: {
    BETTER_AUTH_URL: testHttpOrigin("127.0.0.1:3000", ""),
    BETTER_AUTH_ALLOW_SIGNUP: false,
    BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-chars",
    BETTER_AUTH_TRUSTED_ORIGINS: [],
  },
}));

import { betterAuth } from "better-auth";
import { admin, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { auth } from "@/auth/server";

describe("auth server", () => {
  it("configures organization and admin plugins before cookie plugin", () => {
    expect(auth.api).toBeDefined();
    expect(organization).toHaveBeenCalledWith(
      expect.objectContaining({
        allowUserToCreateOrganization: false,
        requireEmailVerificationOnInvitation: false,
        sendInvitationEmail: expect.any(Function),
      })
    );
    expect(admin).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultBanReason: "disabled",
        bannedUserMessage: "This account is disabled.",
        ac: expect.anything(),
        roles: expect.objectContaining({
          admin: expect.anything(),
          user: expect.anything(),
        }),
      })
    );
    expect(tanstackStartCookies).toHaveBeenCalled();

    const config = vi.mocked(betterAuth).mock.calls[0]?.[0] as {
      plugins: unknown[];
      databaseHooks: {
        user: { create: { after: unknown } };
        session: { create: { after: unknown } };
      };
    };
    expect(config.plugins).toHaveLength(5);
    expect(config.plugins.at(-1)).toEqual({ id: "tanstack-start-cookies" });
    expect(config.databaseHooks.user.create.after).toEqual(
      expect.any(Function)
    );
    expect(config.databaseHooks.session.create.after).toEqual(
      expect.any(Function)
    );
  });
});
