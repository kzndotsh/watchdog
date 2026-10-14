import { vi } from "vitest";

import { resetCliEnvForTests } from "../env";
import { CliExitError } from "../io";
import { boot } from "../main";

/** Thrown by the stubbed `process.exit` so the run stops where the real one would. */
class ExitSignalError extends Error {
  readonly code: number;

  constructor(code: number) {
    super(`exit ${code}`);
    this.name = "ExitSignalError";
    this.code = code;
  }
}

export type WdRun = {
  /** The first `process.exit` code, or 0 when the run returned normally. */
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
};

/**
 * Run `wd <args>` in-process through the same `boot()` the binary uses. `env` entries are set
 * for the run (`undefined` unsets); WD_API_KEY and WD_API_URL are unset unless given. The
 * stubs (`process.exit`, console, stderr, env) are undone before this returns, so a run
 * leaves nothing behind for the next file in the worker.
 *
 * Test files that use this mock `dotenv`, so a developer `.env` above the checkout is not
 * loaded into `process.env` (see `env.test.ts`).
 */
export async function runWd(
  args: string[],
  env: Record<string, string | undefined> = {}
): Promise<WdRun> {
  for (const [key, value] of Object.entries({
    WD_API_KEY: undefined,
    WD_API_URL: undefined,
    ...env,
  })) {
    vi.stubEnv(key, value);
  }
  resetCliEnvForTests();

  const stdout: string[] = [];
  const stderr: string[] = [];
  let status: number | undefined;
  /** Output after the first exit is fallout from unwinding the stubbed exit, not CLI output. */
  const live = (sink: string[], text: string) => {
    if (status === undefined) sink.push(text);
  };
  const spies = [
    vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      live(stdout, parts.map(String).join(" "));
    }),
    vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      live(stderr, `${parts.map(String).join(" ")}\n`);
    }),
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      live(stderr, String(chunk));
      return true;
    }),
    vi.spyOn(process, "exit").mockImplementation((code) => {
      status ??= Number(code ?? 0);
      throw new ExitSignalError(status);
    }),
  ];
  try {
    await boot(args);
  } catch (error) {
    // Unwinding a stubbed exit can re-enter the CLI's error handling, which throws its own
    // CliExitError past `boot`; once an exit is recorded, that is fallout, not a failure.
    const unwinding =
      error instanceof ExitSignalError ||
      (status !== undefined && error instanceof CliExitError);
    if (!unwinding) throw error;
  } finally {
    for (const spy of spies) spy.mockRestore();
    vi.unstubAllEnvs();
    resetCliEnvForTests();
  }
  return {
    status: status ?? 0,
    stdout: stdout.join("\n"),
    stderr: stderr.join(""),
  };
}

/** The first stdout line that is a JSON object, parsed. */
export function firstJson(stdout: string): unknown {
  const line = stdout.split("\n").find((row) => row.startsWith("{"));
  if (line === undefined) {
    throw new Error(`expected a JSON line in: ${stdout}`);
  }
  return JSON.parse(line);
}
