import { describe, expect, it } from "vitest";

import { changesSessionRow, needsAuthoritativeSession } from "../session-cache";

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

describe("changesSessionRow", () => {
  it.each([
    "/organization/create",
    "/organization/delete",
    "/organization/leave",
    "/organization/accept-invitation",
    "/organization/remove-member",
  ])("expires the cached session after %s", (path) => {
    expect(changesSessionRow(path)).toBe(true);
  });

  it.each([
    "/organization/set-active",
    "/organization/update",
    "/organization/invite-member",
    "/get-session",
    undefined,
  ])("leaves the cache cookie alone after %s", (path) => {
    expect(changesSessionRow(path)).toBe(false);
  });
});
