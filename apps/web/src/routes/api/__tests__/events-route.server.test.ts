import { Data, Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testHttpOrigin, testId } from "@watchdog/test-kit";

class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entity: string;
  readonly id: string;
}> {}

const createApiContextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ actor: null })
);
const corsPreflightResponseMock = vi.hoisted(() => vi.fn());
const applyWatchdogCorsMock = vi.hoisted(() =>
  vi.fn((_request: Request, response: Response) => response)
);
const listenForEventsMock = vi.hoisted(() => vi.fn());
const replayActivityEffectMock = vi.hoisted(() => vi.fn());
/** The fake tailer a route subscribes to: tests play live entries through `listener`. */
const tailerState = vi.hoisted(() => ({
  listener: undefined as ((entry: unknown) => void) | undefined,
  unsubscribe: vi.fn(),
  subscribeFails: false,
}));
const ActivityTailerTag = await vi.hoisted(async () => {
  const { Context } = await import("effect");
  class ActivityTailer extends Context.Service<
    ActivityTailer,
    {
      readonly subscribe: (
        listener: (entry: unknown) => void
      ) => Effect.Effect<() => void, Error>;
    }
  >()("test/ActivityTailer") {}
  return ActivityTailer;
});
const assertCaseInOrgEffectMock = vi.hoisted(() => vi.fn());
const listVisibleCaseIdsEffectMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());
const logSetMock = vi.hoisted(() => vi.fn());
const logEmitMock = vi.hoisted(() => vi.fn());
const createLoggerMock = vi.hoisted(() =>
  vi.fn(() => ({ error: logErrorMock, set: logSetMock, emit: logEmitMock }))
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

vi.mock("@/auth/api-context.server", () => ({
  createApiContext: createApiContextMock,
}));

vi.mock("@/lib/api-cors.server", () => ({
  applyWatchdogCors: applyWatchdogCorsMock,
  corsPreflightResponse: corsPreflightResponseMock,
}));

vi.mock("@watchdog/api", () => ({
  runApp: (
    effect: Effect.Effect<unknown, unknown, typeof ActivityTailerTag.Identifier>
  ) =>
    Effect.runPromise(
      Effect.provideService(effect, ActivityTailerTag, {
        subscribe: (listener) =>
          tailerState.subscribeFails
            ? Effect.fail(new Error("tailer down"))
            : Effect.sync(() => {
                tailerState.listener = listener;
                return tailerState.unsubscribe;
              }),
      })
    ),
}));

vi.mock("@watchdog/core/activity", () => ({
  ActivityTailer: ActivityTailerTag,
  replayActivityEffect: replayActivityEffectMock,
}));

vi.mock("@watchdog/core/graph", () => ({
  assertCaseInOrgEffect: assertCaseInOrgEffectMock,
}));

vi.mock("@watchdog/core/cases", () => ({
  listVisibleCaseIdsEffect: listVisibleCaseIdsEffectMock,
}));

vi.mock("@watchdog/core/events", () => ({
  listenForEvents: listenForEventsMock,
}));

vi.mock("@watchdog/log", () => ({ createLogger: createLoggerMock }));

import { Route } from "@/routes/api/events";

describe("api events route", () => {
  it("returns a cors preflight response for OPTIONS when configured", async () => {
    const preflight = new Response(null, { status: 204 });
    corsPreflightResponseMock.mockReturnValue(preflight);
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.OPTIONS({
      request: new Request(testHttpOrigin("localhost", "/api/events"), {
        method: "OPTIONS",
      }),
    });

    expect(response).toBe(preflight);
  });

  it("returns 401 when the request is unauthenticated", async () => {
    createApiContextMock.mockResolvedValue({ actor: null });
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.GET({
      request: new Request(testHttpOrigin("localhost", "/api/events")),
    });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
  });

  it("returns 403 when the actor has no organization", async () => {
    createApiContextMock.mockResolvedValue({
      actor: { userId: "u1", email: null, name: null, organizationId: null },
    });
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.GET({
      request: new Request(testHttpOrigin("localhost", "/api/events")),
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });

  it("returns 400 when caseId is whitespace-only", async () => {
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
    });
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.GET({
      request: new Request(
        testHttpOrigin("localhost", "/api/events?caseId=%20%20")
      ),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Bad Request");
  });

  it("returns 400 when caseId is not a valid uuid", async () => {
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
    });
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.GET({
      request: new Request(
        testHttpOrigin("localhost", "/api/events?caseId=not-a-uuid")
      ),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Bad Request");
  });

  it("trims padded caseId before scoped lookup", async () => {
    const caseId = testId(10);
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
    });
    assertCaseInOrgEffectMock.mockReturnValue(Effect.succeed(caseId));
    listVisibleCaseIdsEffectMock.mockReturnValue(Effect.succeed([caseId]));
    listenForEventsMock.mockReturnValue({ end: vi.fn() });
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.GET({
      request: new Request(
        testHttpOrigin("localhost", `/api/events?caseId=%20${caseId}%20`)
      ),
    });

    expect(response.status).toBe(200);
    expect(assertCaseInOrgEffectMock).toHaveBeenCalledWith(caseId, "org-1");
    await response.body?.cancel();
  });

  it("closes the stream when the actor loses the organization mid-stream", async () => {
    vi.useFakeTimers();
    try {
      const actor = {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      };
      createApiContextMock.mockResolvedValue({ actor });
      const end = vi.fn();
      listenForEventsMock.mockReturnValue({ end });
      const handlers = (
        Route.options as {
          server: {
            handlers: Record<
              string,
              (ctx: { request: Request }) => Promise<Response>
            >;
          };
        }
      ).server.handlers;

      const response = await handlers.GET({
        request: new Request(testHttpOrigin("localhost", "/api/events")),
      });

      // Removed from the organization: the next beat must end the stream.
      createApiContextMock.mockResolvedValue({ actor: null });
      await vi.advanceTimersByTimeAsync(25_000);

      expect(end).toHaveBeenCalled();
      await response.body?.cancel();
    } finally {
      vi.useRealTimers();
      createApiContextMock.mockResolvedValue({ actor: null });
    }
  });

  it("returns 404 when core reports the Case as not visible to the organization", async () => {
    const caseId = testId(11);
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
    });
    assertCaseInOrgEffectMock.mockReturnValue(
      Effect.fail(new NotFoundError({ entity: "Case", id: "c1" }))
    );
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.GET({
      request: new Request(
        testHttpOrigin("localhost", `/api/events?caseId=${caseId}`)
      ),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it("does not deliver events for a Case core no longer lists as visible", async () => {
    const hiddenCaseId = testId(12);
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
    });
    listVisibleCaseIdsEffectMock.mockReturnValue(Effect.succeed([]));
    let onMessage: ((raw: string) => void) | undefined;
    listenForEventsMock.mockImplementation(
      (cb: (raw: string) => void, onReady?: () => void) => {
        onMessage = cb;
        onReady?.();
        return { end: vi.fn() };
      }
    );
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.GET({
      request: new Request(testHttpOrigin("localhost", "/api/events")),
    });
    onMessage?.(
      JSON.stringify({ type: "entity_changed", caseId: hiddenCaseId })
    );
    // let the allowed-set refresh through core settle
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const reader = response.body?.getReader();
    const first = await reader?.read();
    const text = new TextDecoder().decode(first?.value);
    expect(text).toContain("connected");
    expect(text).not.toContain("entity_changed");
    await reader?.cancel();
  });

  it("drops the event and logs when the visibility read fails", async () => {
    const caseId = testId(13);
    createApiContextMock.mockResolvedValue({
      actor: {
        userId: "u1",
        email: null,
        name: null,
        organizationId: "org-1",
      },
    });
    listVisibleCaseIdsEffectMock
      .mockReturnValueOnce(Effect.succeed([]))
      .mockReturnValueOnce(Effect.die(new Error("pool exhausted")));
    let onMessage: ((raw: string) => void) | undefined;
    listenForEventsMock.mockImplementation(
      (cb: (raw: string) => void, onReady?: () => void) => {
        onMessage = cb;
        onReady?.();
        return { end: vi.fn() };
      }
    );
    const handlers = (
      Route.options as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >;
        };
      }
    ).server.handlers;

    const response = await handlers.GET({
      request: new Request(testHttpOrigin("localhost", "/api/events")),
    });
    onMessage?.(JSON.stringify({ type: "entity_changed", caseId }));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(logEmitMock).toHaveBeenCalled();
    // no Case id (or payload) goes into the log context
    expect(JSON.stringify(createLoggerMock.mock.calls)).not.toContain(caseId);
    const reader = response.body?.getReader();
    const first = await reader?.read();
    const text = new TextDecoder().decode(first?.value);
    expect(text).toContain("connected");
    expect(text).not.toContain("entity_changed");
    await reader?.cancel();
  });
});

describe("api events route: activity log", () => {
  const caseId = testId(10);
  const actor = {
    userId: "u1",
    email: null,
    name: null,
    organizationId: "org-1",
  };

  function entry(id: number, forCase: string = caseId) {
    return {
      cursor: `7:${id}`,
      id,
      caseId: forCase,
      kind: "task",
      action: "created",
      subjectId: null,
      groupId: null,
      label: `task ${id}`,
      actorId: null,
      actorLabel: null,
      fromValue: null,
      toValue: "backlog",
      at: "2026-01-01T00:00:00.000Z",
    };
  }

  type Handler = (ctx: { request: Request }) => Promise<Response>;

  async function connect(path = "/api/events", headers?: HeadersInit) {
    const handlers = (
      Route.options as { server: { handlers: Record<string, Handler> } }
    ).server.handlers;
    const response = await handlers.GET({
      request: new Request(testHttpOrigin("localhost", path), { headers }),
    });
    return response;
  }

  /** Read chunks until `done(text)` holds, then stop; the stream stays open. */
  async function readUntil(
    response: Response,
    done: (text: string) => boolean
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (reader === undefined) return "";
    let text = "";
    let finished = done(text);
    while (!finished) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
      finished = done(text);
    }
    reader.releaseLock();
    return text;
  }

  beforeEach(() => {
    createApiContextMock.mockResolvedValue({ actor });
    listVisibleCaseIdsEffectMock.mockReturnValue(Effect.succeed([caseId]));
    listenForEventsMock.mockImplementation(
      (_cb: unknown, onReady?: () => void) => {
        onReady?.();
        return { end: vi.fn() };
      }
    );
    replayActivityEffectMock.mockReset();
    tailerState.listener = undefined;
    tailerState.subscribeFails = false;
    tailerState.unsubscribe.mockClear();
  });

  it("sends a live entry as its legacy event and as an activity event, both with the cursor id", async () => {
    const response = await connect();
    await readUntil(response, (text) => text.includes("connected"));

    tailerState.listener?.(entry(5));
    const text = await readUntil(response, (t) =>
      t.includes("event: activity")
    );

    expect(text).toContain(
      `id: 7:5\nevent: task_changed\ndata: ${JSON.stringify({ type: "task_changed", caseId })}\n\n`
    );
    expect(text).toContain("id: 7:5\nevent: activity\ndata: ");
    expect(text).toContain('"label":"task 5"');
    expect(replayActivityEffectMock).not.toHaveBeenCalled();
    await response.body?.cancel();
  });

  it("filters entries by the caseId query and by organization visibility", async () => {
    const other = testId(20);
    const hidden = testId(21);
    listVisibleCaseIdsEffectMock.mockReturnValue(
      Effect.succeed([caseId, other])
    );
    assertCaseInOrgEffectMock.mockReturnValue(Effect.succeed(caseId));
    const response = await connect(`/api/events?caseId=${caseId}`);
    await readUntil(response, (text) => text.includes("connected"));

    tailerState.listener?.(entry(1, other));
    tailerState.listener?.(entry(2, hidden));
    tailerState.listener?.(entry(3, caseId));
    const text = await readUntil(response, (t) =>
      t.includes("event: activity")
    );

    expect(text).toContain("id: 7:3\n");
    expect(text).not.toContain("id: 7:1\n");
    expect(text).not.toContain("id: 7:2\n");
    await response.body?.cancel();
  });

  it("replays missed entries on Last-Event-ID exactly once, merged with live ones", async () => {
    replayActivityEffectMock.mockImplementation(() => {
      // A live entry (6) arrives while the replay is read; the replay holds 5 and 6 too.
      tailerState.listener?.(entry(6));
      return Effect.succeed({
        kind: "entries",
        entries: [entry(5), entry(6)],
      });
    });
    const response = await connect("/api/events", { "Last-Event-ID": "7:4" });
    tailerState.listener?.(entry(7));
    const text = await readUntil(
      response,
      (t) => (t.match(/event: activity/g) ?? []).length >= 3
    );

    expect(replayActivityEffectMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      caseId: undefined,
      after: { xid: "7", id: 4 },
    });
    const ids = [...text.matchAll(/id: (7:\d+)\nevent: activity/g)].map(
      (m) => m[1]
    );
    expect(ids).toEqual(["7:5", "7:6", "7:7"]);
    expect(text).not.toContain("event: resync");
    await response.body?.cancel();
  });

  it("accepts the cursor as ?after= on a first connect, and Last-Event-ID wins", async () => {
    replayActivityEffectMock.mockReturnValue(
      Effect.succeed({ kind: "entries", entries: [] })
    );
    const response = await connect("/api/events?after=7:2", {
      "Last-Event-ID": "7:9",
    });
    await readUntil(response, (text) => text.includes("connected"));
    expect(replayActivityEffectMock).toHaveBeenCalledWith(
      expect.objectContaining({ after: { xid: "7", id: 9 } })
    );
    await response.body?.cancel();
  });

  it("sends one resync when the client is too far behind", async () => {
    replayActivityEffectMock.mockReturnValue(
      Effect.succeed({ kind: "resync" })
    );
    const response = await connect("/api/events", { "Last-Event-ID": "7:1" });
    const text = await readUntil(response, (t) => t.includes("event: resync"));
    expect(text.match(/event: resync/g)).toHaveLength(1);
    await response.body?.cancel();
  });

  it("answers an unreadable cursor with a resync and skips the replay", async () => {
    const response = await connect("/api/events", {
      "Last-Event-ID": "garbage",
    });
    const text = await readUntil(response, (t) => t.includes("event: resync"));
    expect(text).toContain("event: resync\ndata: {}");
    expect(replayActivityEffectMock).not.toHaveBeenCalled();
    await response.body?.cancel();
  });

  it("falls back to a resync when the replay read fails", async () => {
    replayActivityEffectMock.mockReturnValue(Effect.die(new Error("db down")));
    const response = await connect("/api/events", { "Last-Event-ID": "7:1" });
    const text = await readUntil(response, (t) => t.includes("event: resync"));
    expect(text).toContain("event: resync");
    expect(logErrorMock).toHaveBeenCalled();
    await response.body?.cancel();
  });

  it("unsubscribes from the tailer when the client goes away", async () => {
    const response = await connect();
    await readUntil(response, (text) => text.includes("connected"));
    await response.body?.cancel();
    await vi.waitFor(() => {
      expect(tailerState.unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  it("closes the stream with an error event when the tailer cannot start", async () => {
    tailerState.subscribeFails = true;
    const response = await connect();
    const text = await readUntil(response, (t) => t.includes("event: error"));
    expect(text).toContain("Live updates unavailable");
  });
});
