import { describe, expect, it } from "vitest";

import { requestCspNonce } from "../csp-nonce";

describe("requestCspNonce", () => {
  it("is undefined outside a Start request", () => {
    expect(requestCspNonce()).toBeUndefined();
  });
});
