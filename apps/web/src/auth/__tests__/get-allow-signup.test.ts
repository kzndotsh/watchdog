import { afterEach, describe, expect, it, vi } from "vitest";

import { getAllowSignup } from "@/auth/get-allow-signup";

function stubResponse(response: Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Promise.resolve(response))
  );
}

describe("getAllowSignup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the open flag from /api/signup-allowed", async () => {
    stubResponse(Response.json({ allowSignup: true }));
    await expect(getAllowSignup()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/signup-allowed");
  });

  it("reads anything but an explicit true as closed", async () => {
    stubResponse(Response.json({ allowSignup: "yes" }));
    await expect(getAllowSignup()).resolves.toBe(false);
  });

  it("reads a failed request as closed", async () => {
    stubResponse(new Response(null, { status: 500 }));
    await expect(getAllowSignup()).resolves.toBe(false);
  });
});
