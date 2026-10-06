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

import {
  ACTIVITY_CHANNEL,
  listenForEvents,
  listenOnChannel,
  WATCHDOG_CHANNEL,
} from "../events";

describe("listenForEvents", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the LISTEN connection open once LISTEN is established", async () => {
    postgresMocks.listen.mockImplementation(
      async (
        _channel: string,
        _onNotification: (payload: string) => void,
        onReady?: () => void
      ) => {
        onReady?.();
      }
    );
    const onReady = vi.fn();

    const listener = listenForEvents(() => {}, onReady);

    await vi.waitFor(() => {
      expect(postgresMocks.listen).toHaveBeenCalledTimes(1);
    });
    // Awaiting `sql.listen` only waits for LISTEN to start: the connection must
    // not be torn down behind it, or every notification would be lost.
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(postgresMocks.end).not.toHaveBeenCalled();
    expect(postgresMocks.listen).toHaveBeenCalledTimes(1);
    expect(postgresMocks.listen).toHaveBeenCalledWith(
      WATCHDOG_CHANNEL,
      expect.any(Function),
      expect.any(Function)
    );
    expect(onReady).toHaveBeenCalledTimes(1);

    await listener.end();
    expect(postgresMocks.end).toHaveBeenCalledTimes(1);
  });

  it("retries a failed initial connection", async () => {
    let calls = 0;
    postgresMocks.listen.mockImplementation(
      async (
        _channel: string,
        _onNotification: (payload: string) => void,
        onReady?: () => void
      ) => {
        calls += 1;
        if (calls === 1) throw new Error("connection refused");
        onReady?.();
      }
    );
    const onReady = vi.fn();

    const listener = listenOnChannel(ACTIVITY_CHANNEL, () => {}, onReady);

    await vi.waitFor(
      () => {
        expect(postgresMocks.listen).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000, interval: 50 }
    );
    expect(postgresMocks.listen).toHaveBeenNthCalledWith(
      2,
      ACTIVITY_CHANNEL,
      expect.any(Function),
      expect.any(Function)
    );
    expect(onReady).toHaveBeenCalledTimes(1);

    await listener.end();
  });
});
