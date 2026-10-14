import { describe, expect, it } from "vitest";

import {
  needsAuthoritativeSession,
  SESSION_COOKIE_CACHE_SECONDS,
  sessionCookieCache,
} from "../session-cache";

describe("session cookie cache config", () => {
  it("caches for 60 seconds and never refreshes without a database read", () => {
    expect(SESSION_COOKIE_CACHE_SECONDS).toBe(60);
    expect(sessionCookieCache).toEqual({
      enabled: true,
      maxAge: 60,
      refreshCache: false,
    });
  });
});

describe("needsAuthoritativeSession", () => {
  it.each([
    "/admin/ban-user",
    "/admin/unban-user",
    "/admin/set-role",
    "/admin/revoke-user-sessions",
    "/admin/list-users",
    "/organization/remove-member",
    "/organization/update-member-role",
    "/organization/invite-member",
    "/organization/delete",
    "/organization/leave",
  ])("reads the database for %s", (path) => {
    expect(needsAuthoritativeSession(path)).toBe(true);
  });

  it.each([
    "/get-session",
    "/organization/set-active",
    "/organization/get-active-member-role",
    "/organization/list-members",
    undefined,
  ])("lets %s use the cookie cache", (path) => {
    expect(needsAuthoritativeSession(path)).toBe(false);
  });
});
