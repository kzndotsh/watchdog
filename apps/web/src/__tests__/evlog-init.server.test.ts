import { beforeEach, describe, expect, it, vi } from "vitest";

const initWatchdogLoggerMock = vi.hoisted(() => vi.fn());

vi.mock("@watchdog/env/server", () => ({
  errorReportingSettings: () => ({ dsn: undefined }),
  otlpSettings: () => ({ endpoint: undefined }),
  startupWarnings: () => ["DATABASE_URL test warning"],
}));

const logStartupWarningsMock = vi.hoisted(() => vi.fn());

vi.mock("@watchdog/log", () => ({
  initWatchdogLogger: initWatchdogLoggerMock,
  logStartupWarnings: logStartupWarningsMock,
}));

describe("evlog-init.server", () => {
  // The module initializes on import: re-evaluate it so each test (and repeat) sees its own call.
  beforeEach(() => {
    vi.resetModules();
    logStartupWarningsMock.mockClear();
  });

  it("initializes the web service logger drain on import", async () => {
    await import("../evlog-init.server.ts");

    expect(initWatchdogLoggerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "watchdog-web",
        drainDir: expect.stringContaining(".evlog/logs"),
      })
    );
  });

  it("logs the transport warnings once at start", async () => {
    await import("../evlog-init.server.ts");

    expect(logStartupWarningsMock).toHaveBeenCalledTimes(1);
    expect(logStartupWarningsMock).toHaveBeenCalledWith("startup-config", [
      "DATABASE_URL test warning",
    ]);
  });
});
