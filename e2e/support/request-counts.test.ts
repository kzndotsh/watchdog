import { describe, expect, it } from "vitest";

import {
  isAuthRequest,
  isGateRequest,
  isOrganizationStateRequest,
  serverFnName,
} from "./request-counts";

const ORIGIN = ["http", "://", "127.0.0.1:3300"].join("");

/** What `vite dev` puts after `/_serverFn/` (start-plugin-core `generateFunctionId`, dev mode). */
function devServerFnUrl(exportName: string): string {
  const id = Buffer.from(
    JSON.stringify({
      file: "/@id/__x00__virtual:tanstack-start-server-fn-resolver",
      export: exportName,
    }),
    "utf-8"
  ).toString("base64url");
  return `${ORIGIN}/_serverFn/${id}?payload=%7B%7D`;
}

describe("request-counts", () => {
  it("recognizes Better Auth endpoints", () => {
    expect(isAuthRequest(`${ORIGIN}/api/auth/get-session`)).toBe(true);
    expect(isAuthRequest(`${ORIGIN}/api/auth/organization/list`)).toBe(true);
    expect(isAuthRequest(`${ORIGIN}/api/v1/cases`)).toBe(false);
    expect(isAuthRequest(`${ORIGIN}/tasks`)).toBe(false);
  });

  it("reads the export name out of a dev server function id", () => {
    expect(
      serverFnName(
        devServerFnUrl("getOrganizationStateFn_createServerFn_handler")
      )
    ).toBe("getOrganizationStateFn_createServerFn_handler");
    expect(serverFnName(`${ORIGIN}/_serverFn/${"a".repeat(64)}`)).toBeNull();
    expect(serverFnName(`${ORIGIN}/api/auth/get-session`)).toBeNull();
  });

  it("counts the organization-state function and nothing else of the server functions", () => {
    expect(
      isOrganizationStateRequest(
        devServerFnUrl("getOrganizationStateFn_createServerFn_handler")
      )
    ).toBe(true);
    expect(
      isOrganizationStateRequest(
        devServerFnUrl("getCasesContextFn_createServerFn_handler")
      )
    ).toBe(false);
    expect(isGateRequest(`${ORIGIN}/api/auth/get-session`)).toBe(true);
    expect(
      isGateRequest(devServerFnUrl("listTasksFn_createServerFn_handler"))
    ).toBe(false);
  });
});
