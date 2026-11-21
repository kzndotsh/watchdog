import { describe, expect, it } from "vitest";

import {
  isAuthRequest,
  isGateRequest,
  isOrganizationStateRequest,
} from "./request-counts";

const ORIGIN = ["http", "://", "127.0.0.1:3300"].join("");

describe("request-counts", () => {
  it("recognizes Better Auth endpoints", () => {
    expect(isAuthRequest(`${ORIGIN}/api/auth/get-session`)).toBe(true);
    expect(isAuthRequest(`${ORIGIN}/api/auth/organization/list`)).toBe(true);
    expect(isAuthRequest(`${ORIGIN}/api/v1/cases`)).toBe(false);
    expect(isAuthRequest(`${ORIGIN}/tasks`)).toBe(false);
  });

  it("counts the organization-state call (auth.whoami) and no other oRPC call", () => {
    expect(isOrganizationStateRequest(`${ORIGIN}/api/rpc/auth/whoami`)).toBe(
      true
    );
    expect(isOrganizationStateRequest(`${ORIGIN}/api/rpc/cases/list`)).toBe(
      false
    );
    expect(isGateRequest(`${ORIGIN}/api/auth/get-session`)).toBe(true);
    expect(isGateRequest(`${ORIGIN}/api/rpc/tasks/list`)).toBe(false);
  });
});
