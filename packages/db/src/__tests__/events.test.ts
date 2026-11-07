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

import { ACTIVITY_CHANNEL, listenOnChannel } from "../events";

describe("listenOnChannel", () => {
  afterEach(() => {
    vi.useRealTimers();
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
    vi.useFakeTimers();

    // `listen` is called synchronously: the loop's first await is on it.
    const listener = listenOnChannel(ACTIVITY_CHANNEL, () => {}, onReady);
    expect(postgresMocks.listen).toHaveBeenCalledTimes(1);

    // Awaiting `sql.listen` only waits for LISTEN to start: the connection must
    // not be torn down behind it, or every notification would be lost. Let every
    // pending continuation and a minute of fake time run first.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(postgresMocks.end).not.toHaveBeenCalled();
    expect(postgresMocks.listen).toHaveBeenCalledTimes(1);
    expect(postgresMocks.listen).toHaveBeenCalledWith(
      ACTIVITY_CHANNEL,
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
