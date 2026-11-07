import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

import { http, HttpResponse, mockServer } from "@watchdog/test-kit/http";

import { resetCliEnvForTests } from "../env";

/** Base URL of the stand-in API (the CLI's `WD_API_URL`). */
export const API_URL = "http://wd.test/api/v1";
export const API_KEY = "test-key";

type Json = Parameters<typeof HttpResponse.json>[0];

export type SeenRequest = {
  readonly method: string;
  readonly path: string;
  readonly url: URL;
  readonly headers: Headers;
  readonly body: unknown;
};

export type StandInApi = {
  /** Every request the CLI sent, in order. */
  readonly seen: SeenRequest[];
  /** Answer `method path` (relative to `API_URL`) with a JSON body. */
  readonly json: (
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    body: Json | ((request: SeenRequest) => Json),
    status?: number
  ) => void;
};

/** A request's query string as the client sent it: `a[0]=x&a[1]=y` becomes `{ a: ["x", "y"] }`. */
export function queryOf(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const indexed = /^(.*)\[\d+\]$/.exec(key);
    const name = indexed?.[1];
    if (name === undefined) {
      out[name ?? key] = value;
      continue;
    }
    const current = out[name];
    if (Array.isArray(current)) current.push(value);
    else out[name] = [value];
  }
  return out;
}

/**
 * The network boundary of the CLI: MSW answers the OpenAPI routes the generated client calls,
 * and records what was sent. Registers its own hooks; call once at the top of a file. The CLI
 * env points at `API_URL` for each test. A request no handler answers fails the test.
 */
export function standInApi(): StandInApi {
  const seen: SeenRequest[] = [];

  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  beforeEach(() => {
    seen.length = 0;
    vi.stubEnv("WD_API_URL", API_URL);
    vi.stubEnv("WD_API_KEY", API_KEY);
    resetCliEnvForTests();
  });
  afterEach(() => {
    mockServer.resetHandlers();
    vi.unstubAllEnvs();
    resetCliEnvForTests();
  });
  afterAll(() => {
    mockServer.close();
  });

  return {
    seen,
    json(method, path, body, status = 200) {
      mockServer.use(
        http[method](`${API_URL}${path}`, async ({ request }) => {
          const text = await request.text();
          const url = new URL(request.url);
          const recorded: SeenRequest = {
            method: request.method,
            path: url.pathname.slice(new URL(API_URL).pathname.length),
            url,
            headers: request.headers,
            body: text === "" ? undefined : JSON.parse(text),
          };
          seen.push(recorded);
          return HttpResponse.json(
            typeof body === "function" ? body(recorded) : body,
            { status }
          );
        })
      );
    },
  };
}

/** What `fail()` printed and how the command would exit. */
export type Failure = {
  readonly exitCode: number;
  readonly error: { code: string; message: string; [key: string]: unknown };
  readonly help: string[] | undefined;
};

/**
 * Run a CLI helper that is expected to `fail()`: stdout is captured (the boundary), the
 * `CliExitError` it throws is read for the exit code, and the printed envelope is returned.
 */
export async function failureOf(run: () => unknown): Promise<Failure> {
  const { CliExitError } = await import("../io");
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  try {
    await run();
  } catch (error) {
    if (!(error instanceof CliExitError)) throw error;
    const body: unknown = JSON.parse(lines[0] ?? "null");
    if (
      typeof body !== "object" ||
      body === null ||
      !("error" in body) ||
      typeof body.error !== "object" ||
      body.error === null ||
      !("code" in body.error) ||
      !("message" in body.error) ||
      typeof body.error.code !== "string" ||
      typeof body.error.message !== "string"
    ) {
      throw new Error(`not a failure envelope: ${lines[0]}`, { cause: error });
    }
    return {
      exitCode: error.exitCode,
      error: {
        ...body.error,
        code: body.error.code,
        message: body.error.message,
      },
      help:
        "help" in body && Array.isArray(body.help)
          ? body.help.map(String)
          : undefined,
    };
  } finally {
    spy.mockRestore();
  }
  throw new Error("expected the command to fail");
}

/** The `ids` of a by-ids read. */
export function queryIds(url: URL): string[] {
  const ids = queryOf(url).ids;
  if (ids === undefined) return [];
  return Array.isArray(ids) ? ids : [ids];
}
