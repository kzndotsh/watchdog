import { afterEach, describe, expect, it, vi } from "vitest";

const postgresMocks = vi.hoisted(() => {
  const end = vi.fn(async () => {});
  const listen = vi.fn();
  const postgres = vi.fn(() => ({ listen, end }));
  return { end, listen, postgres };
});

vi.mock("postgres", () => ({
  default: postgresMocks.postgres,
}));

vi.mock("@watchdog/env/server", () => ({
  env: { DATABASE_URL: "postgres://test" },
}));

vi.mock("../client", () => ({
  client: { notify: vi.fn() },
}));

import { listenForEvents, WATCHDOG_CHANNEL } from "../events";

describe("listenForEvents", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reconnects after LISTEN disconnects once ready", async () => {
    let calls = 0;
    postgresMocks.listen.mockImplementation(
      async (
        _channel: string,
        _onNotification: (payload: string) => void,
        onReady?: () => void
      ) => {
        calls += 1;
        onReady?.();
        if (calls === 1) return;
        await new Promise(() => {});
      }
    );

    const listener = listenForEvents(() => {});

    await vi.waitFor(() => {
      expect(postgresMocks.listen).toHaveBeenCalledTimes(1);
    });

    await vi.waitFor(
      () => {
        expect(postgresMocks.listen).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000, interval: 50 }
    );

    expect(postgresMocks.listen).toHaveBeenNthCalledWith(
      1,
      WATCHDOG_CHANNEL,
      expect.any(Function),
      expect.any(Function)
    );
    expect(postgresMocks.listen).toHaveBeenNthCalledWith(
      2,
      WATCHDOG_CHANNEL,
      expect.any(Function),
      expect.any(Function)
    );

    await listener.end();
  });
});
