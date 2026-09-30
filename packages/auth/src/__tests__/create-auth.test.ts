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
  promoteFirstUserToInstanceAdmin: vi.fn(),
  onAuthSessionCreated: vi.fn(),
  resolveUserOrganizationId: vi.fn(),
}));
vi.mock("../invite-signup-plugin", () => ({
  inviteSignupPlugin: vi.fn(() => ({ id: "invite-signup" })),
}));
vi.mock("../send-invitation-email", () => ({
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

import { createAuth } from "../create-auth";

describe("createAuth", () => {
  it("configures organization and admin plugins", () => {
    const auth = createAuth();
    expect(auth.api).toBeDefined();
    expect(organization).toHaveBeenCalledWith(
      expect.objectContaining({
        allowUserToCreateOrganization: expect.any(Function),
        disableOrganizationDeletion: true,
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

    const config = vi.mocked(betterAuth).mock.calls.at(-1)?.[0] as {
      plugins: unknown[];
      databaseHooks: {
        user: { create: { after: unknown } };
        session: { create: { after: unknown } };
      };
    };
    expect(config.plugins).toHaveLength(4);
    expect(config.databaseHooks.user.create.after).toEqual(
      expect.any(Function)
    );
    expect(config.databaseHooks.session.create.after).toEqual(
      expect.any(Function)
    );
  });

  it("lets anyone create an organization only on open-signup installs", () => {
    createAuth();
    const call = vi.mocked(organization).mock.calls.at(-1)?.[0];
    const allow = call?.allowUserToCreateOrganization;
    if (typeof allow !== "function")
      throw new TypeError("expected a policy fn");

    // Test env has signup closed: members can't, the instance admin can.
    expect(allow({ role: "user" } as never)).toBe(false);
    expect(allow({ role: "admin" } as never)).toBe(true);
  });

  it("appends trailing plugins last", () => {
    createAuth({ trailingPlugins: [{ id: "framework-cookies" }] });

    const config = vi.mocked(betterAuth).mock.calls.at(-1)?.[0] as {
      plugins: unknown[];
    };
    expect(config.plugins).toHaveLength(5);
    expect(config.plugins.at(-1)).toEqual({ id: "framework-cookies" });
  });
});
