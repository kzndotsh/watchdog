import { describe, expect, it, vi } from "vitest";

const mockServer = vi.hoisted(() => ({
  listen: vi.fn(),
  resetHandlers: vi.fn(),
  close: vi.fn(),
}));

vi.mock("../http/mock-server.ts", () => ({
  mockServer,
}));

import "../http/msw-setup.ts";

describe("msw-setup", () => {
  it("registers MSW lifecycle hooks on the mock server", () => {
    expect(mockServer.listen).toHaveBeenCalledWith({
      onUnhandledFrame: "bypass",
    });
  });
});
