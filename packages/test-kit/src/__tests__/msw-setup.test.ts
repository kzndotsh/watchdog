import { beforeAll, describe, expect, it, vi } from "vitest";

const mockServer = vi.hoisted(() => ({
  listen: vi.fn(),
  resetHandlers: vi.fn(),
  close: vi.fn(),
}));

vi.mock("../http/mock-server.ts", () => ({
  mockServer,
}));

import "../http/msw-setup.ts";

// msw-setup's own beforeAll runs first; snapshot its call before the per-test mock clear.
let listenCalls: unknown[][] = [];
beforeAll(() => {
  listenCalls = [...mockServer.listen.mock.calls];
});

describe("msw-setup", () => {
  it("registers MSW lifecycle hooks on the mock server", () => {
    expect(listenCalls).toContainEqual([{ onUnhandledFrame: "bypass" }]);
  });
});
