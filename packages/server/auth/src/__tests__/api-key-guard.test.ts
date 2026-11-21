import { describe, expect, it } from "vitest";

import {
  API_KEY_CREATE_REFUSED,
  API_KEY_UPDATE_REFUSED,
  refuseClientApiKeyWrite,
} from "../api-key-guard";

const request = new Request("http://127.0.0.1:3000/api/auth/api-key/create");

describe("refuseClientApiKeyWrite", () => {
  it("lets the server's headerless call through", () => {
    expect(
      refuseClientApiKeyWrite({
        path: "/api-key/create",
        request: undefined,
        headers: undefined,
        body: { permissions: { graph: ["write"] } },
      })
    ).toBeNull();
  });

  it("refuses a client create, by request or by headers", () => {
    for (const via of [
      { request, headers: undefined },
      { request: undefined, headers: new Headers() },
    ]) {
      expect(
        refuseClientApiKeyWrite({ path: "/api-key/create", body: {}, ...via })
      ).toBe(API_KEY_CREATE_REFUSED);
    }
  });

  it("refuses a client update of metadata or permissions, not a rename", () => {
    const call = { path: "/api-key/update", request, headers: undefined };
    expect(
      refuseClientApiKeyWrite({ ...call, body: { keyId: "k", metadata: {} } })
    ).toBe(API_KEY_UPDATE_REFUSED);
    expect(
      refuseClientApiKeyWrite({
        ...call,
        body: { keyId: "k", permissions: {} },
      })
    ).toBe(API_KEY_UPDATE_REFUSED);
    expect(
      refuseClientApiKeyWrite({
        ...call,
        body: { keyId: "k", name: "n", enabled: false },
      })
    ).toBeNull();
    expect(
      refuseClientApiKeyWrite({
        ...call,
        body: { keyId: "k", metadata: undefined },
      })
    ).toBeNull();
  });

  it("ignores other endpoints", () => {
    expect(
      refuseClientApiKeyWrite({
        path: "/api-key/delete",
        request,
        headers: undefined,
        body: {},
      })
    ).toBeNull();
  });
});
