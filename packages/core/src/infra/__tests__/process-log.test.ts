import { describe, expect, it, vi } from "vitest";

const emit = vi.fn();
const error = vi.fn();
const set = vi.fn();
const setLevel = vi.fn();

vi.mock("@watchdog/log", () => ({
  createLogger: vi.fn(() => ({
    error,
    set,
    setLevel,
    emit,
  })),
}));

import { logProcess, logProcessWarning, logSwallowed } from "../process-log";

describe("process-log", () => {
  it("logSwallowed records errors and emits", () => {
    emit.mockClear();
    error.mockClear();
    logSwallowed("test.scope", new Error("boom"), { jobId: "j1" });
    expect(error).toHaveBeenCalled();
    expect(emit).toHaveBeenCalled();
  });

  it("logProcess sets message and emits", () => {
    emit.mockClear();
    set.mockClear();
    logProcess("test.scope", "started", { jobId: "j1" });
    expect(set).toHaveBeenCalledWith({ message: "started" });
    expect(emit).toHaveBeenCalled();
  });

  it("logProcessWarning emits at warn level", () => {
    emit.mockClear();
    set.mockClear();
    setLevel.mockClear();
    logProcessWarning("test.scope", "slow", { data: { queue: "q" } });
    expect(setLevel).toHaveBeenCalledWith("warn");
    expect(set).toHaveBeenCalledWith({ message: "slow" });
    expect(emit).toHaveBeenCalled();
  });
});
