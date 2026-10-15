import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ORPCError, createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { readinessFrom, type ReadinessReport } from "@watchdog/core/infra";

import { health } from "../health";
import { makeReady } from "../ready";

/** Text a real driver puts in its errors: none of it may reach a response. */
const LEAKY =
  "connect ECONNREFUSED 10.9.8.7:5432 postgres://app:hunter2@db.internal/app";
const SECRETS = [
  "ECONNREFUSED",
  "10.9.8.7",
  "hunter2",
  "postgres://",
  "db.internal",
];

const up = Effect.void;
const down = Effect.fail(new Error(LEAKY));

/** Stands in for `runApp`: the services behind the check are core's concern, tested there. */
function runnerFor(
  database: Effect.Effect<unknown, unknown>,
  storage: Effect.Effect<unknown, unknown>
) {
  return async (): Promise<ReadinessReport> =>
    Effect.runPromise(readinessFrom({ database, storage }));
}

const context = {
  headers: new Headers(),
  actor: null,
  authMethod: "session",
} as const;

async function get(path: string, runner: ReturnType<typeof runnerFor>) {
  const handler = new OpenAPIHandler({ ready: makeReady(runner), health });
  const { matched, response } = await handler.handle(
    new Request(`http://localhost/api/v1${path}`),
    { prefix: "/api/v1", context }
  );
  if (!matched) throw new Error(`no route for ${path}`);
  return { status: response.status, text: await response.text() };
}

describe("ready procedure", () => {
  it("answers 200 with every dependency ok", async () => {
    const { status, text } = await get("/ready", runnerFor(up, up));
    expect(status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      ok: true,
      database: "ok",
      storage: "ok",
    });
  });

  it.each([
    [
      "database",
      down,
      up,
      { ok: false, database: "unreachable", storage: "ok" },
    ],
    [
      "storage",
      up,
      down,
      { ok: false, database: "ok", storage: "unreachable" },
    ],
    [
      "both",
      down,
      down,
      { ok: false, database: "unreachable", storage: "unreachable" },
    ],
  ])(
    "answers 503 with the report when %s is down",
    async (_name, database, storage, report) => {
      const { status, text } = await get(
        "/ready",
        runnerFor(database, storage)
      );
      expect(status).toBe(503);
      expect(JSON.parse(text)).toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        status: 503,
        data: report,
      });
    }
  );

  it("leaks no driver, host or credential text in a 503 body", async () => {
    const { text } = await get("/ready", runnerFor(down, down));
    for (const secret of SECRETS) {
      expect(text).not.toContain(secret);
    }
  });

  it("raises a 503 oRPC error carrying the report for in-process callers", async () => {
    const client = createRouterClient(
      { ready: makeReady(runnerFor(up, down)) },
      { context }
    );
    const failure = await client.ready().then(
      () => undefined,
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(ORPCError);
    expect(failure).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      status: 503,
      data: { ok: false, database: "ok", storage: "unreachable" },
    });
  });
});

describe("liveness next to readiness", () => {
  it("keeps the health contract and never consults a dependency", async () => {
    const { status, text } = await get("/health", runnerFor(down, down));
    expect(status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true, service: "watchdog" });
  });
});
