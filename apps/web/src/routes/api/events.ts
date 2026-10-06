/**
 * GET /api/events
 *
 * Server-Sent Events endpoint. Streams the activity log (the per-process
 * `ActivityTailer`, ADR-0005) and the legacy NOTIFY events (`listenForEvents`,
 * for domains not on the log yet) to the browser; Case visibility is decided by
 * core, never by repos.
 *
 * Every log entry is sent as its legacy event (`task_changed`, ...: the adapter
 * that keeps old clients working) and as an `activity` event, both with
 * `id: <cursor>`. `EventSource` resends the last id as `Last-Event-ID` after a
 * reconnect and the missed entries are replayed once; a client too far behind
 * (or holding a cursor the database does not know) gets one `resync` event and
 * refetches. Legacy channel events carry no id and are not replayed.
 *
 * Query params:
 *   caseId  — filter events to this Case (optional)
 *   after   — resume cursor for a first connect (optional; `Last-Event-ID` wins)
 *
 * Auth: session cookie, Bearer token, or x-api-key (same as OpenAPI routes).
 */
import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";

import { createApiContext } from "@/auth/api-context.server";
import {
  applyWatchdogCors,
  corsPreflightResponse,
} from "@/lib/api-cors.server";
import { runApp } from "@watchdog/api";
import { ActivityTailer, replayActivityEffect } from "@watchdog/core/activity";
import { listVisibleCaseIdsEffect } from "@watchdog/core/cases";
import { listenForEvents } from "@watchdog/core/events";
import { assertCaseInOrgEffect } from "@watchdog/core/graph";
import { createLogger } from "@watchdog/log";
import {
  createActivityGate,
  isWatchdogEvent,
  legacyEventForActivityEntry,
  parseActivityCursor,
  parseSseCaseIdParam,
  type ActivityEntry,
} from "@watchdog/schemas/feed";

/** Process log for a failed stream step; carries the error only, never Case or Evidence data. */
function logStreamFailure(scope: string, error: unknown): void {
  const log = createLogger({ scope });
  log.error(error instanceof Error ? error : new Error(String(error)));
  void log.emit();
}

/** Process log for a dropped live event; carries the error only, never Case or Evidence data. */
function logVisibilityRefreshFailure(error: unknown): void {
  logStreamFailure("sse.visibility_refresh", error);
}

/**
 * The cursor a reconnecting client sent: `Last-Event-ID` (set by `EventSource`)
 * wins over `?after=`. `malformed` when one was sent but cannot be read, which
 * is answered with a `resync`, never a guess.
 */
function resumeCursor(request: Request, url: URL) {
  const raw =
    request.headers.get("last-event-id") ?? url.searchParams.get("after");
  if (raw === null || raw.trim() === "") {
    return { after: null, malformed: false } as const;
  }
  const after = parseActivityCursor(raw);
  return { after, malformed: after === null } as const;
}

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      OPTIONS: async ({ request }: { request: Request }) =>
        corsPreflightResponse(request) ?? new Response(null, { status: 204 }),
      GET: async ({ request }: { request: Request }) => {
        const ctx = await createApiContext(request);
        if (!ctx.actor) {
          return new Response("Unauthorized", { status: 401 });
        }
        const organizationId = ctx.actor.organizationId;
        if (!organizationId) {
          return new Response("Forbidden", { status: 403 });
        }

        const url = new URL(request.url);
        const caseIdParsed = parseSseCaseIdParam(
          url.searchParams.get("caseId")
        );
        if (!caseIdParsed.ok) {
          return new Response("Bad Request", { status: 400 });
        }
        const caseId = caseIdParsed.value.caseId;
        if (caseId !== null) {
          const visible = await runApp(
            assertCaseInOrgEffect(caseId, organizationId).pipe(
              Effect.as(true),
              Effect.catchTag("NotFoundError", () => Effect.succeed(false))
            )
          );
          if (!visible) {
            return new Response("Not Found", { status: 404 });
          }
        }

        const scopeOrganizationId = organizationId;
        const resume = resumeCursor(request, url);
        let allowed = new Set(
          await runApp(listVisibleCaseIdsEffect(scopeOrganizationId))
        );

        async function isVisible(eventCaseId: string): Promise<boolean> {
          if (allowed.has(eventCaseId)) return true;
          allowed = new Set(
            await runApp(listVisibleCaseIdsEffect(scopeOrganizationId))
          );
          return allowed.has(eventCaseId);
        }

        let closeOnCancel: (() => void) | undefined;
        const stream = new ReadableStream({
          // A consumer that cancels the body (not only an aborted request) must release
          // its tailer subscription and LISTEN connection.
          cancel() {
            closeOnCancel?.();
          },
          start(controller) {
            const enc = new TextEncoder();
            let closed = false;
            let listener: ReturnType<typeof listenForEvents> | undefined;
            let unsubscribe: (() => void) | undefined;
            // Entries go out one at a time so a visibility refresh cannot reorder them.
            let entryChain: Promise<void> = Promise.resolve();

            // Membership is re-checked on every beat: a user removed from the organization (or a
            // revoked key) must not keep receiving its events until they reconnect.
            const heartbeat = setInterval(() => {
              try {
                controller.enqueue(enc.encode(": heartbeat\n\n"));
              } catch {
                clearInterval(heartbeat);
                return;
              }
              void createApiContext(request)
                .then((current) => {
                  if (current.actor?.organizationId !== organizationId) {
                    closeStream("Access revoked");
                  }
                })
                .catch(() => {
                  // fail closed: without a successful check the stream must not keep delivering
                  closeStream("Access could not be verified");
                });
            }, 25_000);

            function send(eventType: string, data: string, id?: string) {
              try {
                const idLine = id === undefined ? "" : `id: ${id}\n`;
                controller.enqueue(
                  enc.encode(`${idLine}event: ${eventType}\ndata: ${data}\n\n`)
                );
              } catch {
                // client disconnected
              }
            }

            function closeStream(errorMessage?: string) {
              if (closed) return;
              closed = true;
              clearInterval(heartbeat);
              unsubscribe?.();
              void listener?.end();
              if (errorMessage !== undefined) {
                send("error", JSON.stringify({ message: errorMessage }));
              }
              try {
                controller.close();
              } catch {
                // already closed
              }
            }

            function sendEntry(entry: ActivityEntry) {
              const legacy = legacyEventForActivityEntry(entry);
              if (legacy !== null) {
                send(legacy.type, JSON.stringify(legacy), entry.cursor);
              }
              send("activity", JSON.stringify(entry), entry.cursor);
            }

            function deliverEntry(entry: ActivityEntry) {
              if (caseId !== null && entry.caseId !== caseId) return;
              entryChain = entryChain
                .then(async () => {
                  if (closed || !(await isVisible(entry.caseId))) return;
                  sendEntry(entry);
                })
                .catch(logVisibilityRefreshFailure);
            }

            /** Subscribe to the tailer, then replay what the client missed (in that order). */
            async function attachActivity() {
              const gate = createActivityGate(resume.after, deliverEntry);
              try {
                unsubscribe = await runApp(
                  Effect.flatMap(Effect.service(ActivityTailer), (tailer) =>
                    tailer.subscribe(gate.live)
                  )
                );
              } catch (error) {
                logStreamFailure("sse.activity_subscribe", error);
                closeStream("Live updates unavailable");
                return;
              }
              if (closed) {
                unsubscribe();
                return;
              }
              if (resume.malformed) {
                send("resync", "{}");
                gate.open([]);
                return;
              }
              if (resume.after === null) {
                gate.open([]);
                return;
              }
              try {
                const replay = await runApp(
                  replayActivityEffect({
                    organizationId: scopeOrganizationId,
                    caseId: caseId ?? undefined,
                    after: resume.after,
                  })
                );
                if (replay.kind === "resync") {
                  send("resync", "{}");
                  gate.open([]);
                } else {
                  gate.open(replay.entries);
                }
              } catch (error) {
                // Without a replay the safe answer is a full refetch.
                logStreamFailure("sse.activity_replay", error);
                send("resync", "{}");
                gate.open([]);
              }
            }

            listener = listenForEvents(
              (rawPayload) => {
                try {
                  const parsed: unknown = JSON.parse(rawPayload);
                  if (!isWatchdogEvent(parsed)) return;
                  const eventCaseId = parsed.caseId;
                  if (eventCaseId === undefined || eventCaseId === "") return;
                  if (caseId && eventCaseId !== caseId) return;
                  if (allowed.has(eventCaseId)) {
                    send(parsed.type, rawPayload);
                    return;
                  }
                  void runApp(listVisibleCaseIdsEffect(scopeOrganizationId))
                    .then((ids) => {
                      allowed = new Set(ids);
                      if (allowed.has(eventCaseId)) {
                        send(parsed.type, rawPayload);
                      }
                    })
                    .catch((error: unknown) => {
                      // Fail closed: without a visibility read the event is dropped.
                      // Log the failure (error only: no Case id, no payload) so a
                      // dropped live update is observable.
                      logVisibilityRefreshFailure(error);
                    });
                } catch {
                  // malformed — skip
                }
              },
              () => {
                send("connected", JSON.stringify({ ok: true }));
              },
              (error: unknown) => {
                closeStream(
                  error instanceof Error ? error.message : String(error)
                );
              }
            );

            closeOnCancel = () => {
              closeStream();
            };
            void attachActivity();

            request.signal.addEventListener("abort", () => {
              closeStream();
            });
          },
        });

        return applyWatchdogCors(
          request,
          new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
            },
          })
        );
      },
    },
  },
});
