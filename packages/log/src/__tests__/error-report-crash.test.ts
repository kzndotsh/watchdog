import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configureErrorReporting,
  installProcessErrorHandlers,
  resetErrorReporting,
  type ErrorReport,
  type ProcessLike,
} from "../error-report.ts";
import { createScrubber } from "../error-scrub.ts";

type Listener = (error: unknown) => void;

function fakeProcess() {
  const listeners = new Map<string, Listener[]>();
  const exit = vi.fn();
  const written: string[] = [];
  const target: ProcessLike = {
    on: (event, listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
    exit,
    stderr: { write: (text) => written.push(text) },
  };
  return { target, listeners, exit, written };
}

afterEach(() => {
  resetErrorReporting();
});

describe("scrubbing before truncation", () => {
  it("never leaks a prefix of a secret that crosses the cutoff", () => {
    const secret = "S3CRET-".concat("x".repeat(40), "-END");
    const { scrubText } = createScrubber({ secrets: [secret] });
    // the secret starts 10 characters before the 2000-character cutoff
    const text = `${"a ".repeat(995)}${secret} tail`;
    const out = scrubText(text);
    expect(out.length).toBeLessThanOrEqual(2000);
    expect(out).not.toContain("S3CRET");
    expect(out).not.toContain("xxxx");
  });
});

describe("process crash handlers", () => {
  it("reports an uncaught exception, waits a bounded time, then exits 1", async () => {
    const sent: ErrorReport[] = [];
    let finish: () => void = () => {};
    configureErrorReporting({
      service: "svc",
      sink: {
        send: async (report) => {
          sent.push(report);
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        },
      },
    });
    const proc = fakeProcess();
    installProcessErrorHandlers(proc.target);

    const [onUncaught] = proc.listeners.get("uncaughtException") ?? [];
    onUncaught?.(new Error("kaboom"));

    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]).toMatchObject({ level: "fatal", message: "kaboom" });
    // the sink is still pending: exit waits for it ...
    expect(proc.exit).not.toHaveBeenCalled();
    finish();
    // ... and happens as soon as it settles
    await vi.waitFor(() => {
      expect(proc.exit).toHaveBeenCalledWith(1);
    });
    expect(proc.written.join("")).toContain("uncaughtException: ");
  });

  it("an unhandled rejection reports and exits 1, even when the sink never answers", async () => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    try {
      configureErrorReporting({
        service: "svc",
        sink: { send: async () => new Promise<void>(() => {}) },
      });
      const proc = fakeProcess();
      installProcessErrorHandlers(proc.target);

      const [onRejection] = proc.listeners.get("unhandledRejection") ?? [];
      onRejection?.("plain string reason");
      vi.setSystemTime(Date.now() + 5000);

      await vi.waitFor(
        () => {
          expect(proc.exit).toHaveBeenCalledWith(1);
        },
        { timeout: 3000 }
      );
      expect(proc.written.join("")).toContain("plain string reason");
    } finally {
      vi.useRealTimers();
    }
  });

  it("registers its listeners once per process, however often it is installed", () => {
    const proc = fakeProcess();
    installProcessErrorHandlers(proc.target);
    installProcessErrorHandlers(proc.target);
    expect(proc.listeners.get("uncaughtException")).toHaveLength(1);
    expect(proc.listeners.get("unhandledRejection")).toHaveLength(1);
  });
});
