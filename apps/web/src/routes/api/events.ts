/**
 * GET /api/events
 *
 * Server-Sent Events endpoint. Streams NOTIFY events (listenForEvents, via core)
 * to the browser; Case visibility is decided by core, never by repos.
 *
 * Query params:
 *   caseId  — filter events to this Case (optional)
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
import {
  assertCaseInOrgEffect,
  isWatchdogEvent,
  listenForEvents,
  listVisibleCaseIdsEffect,
} from "@watchdog/core";
import { parseSseCaseIdParam } from "@watchdog/schemas";

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

        let allowed = new Set(
          await runApp(listVisibleCaseIdsEffect(organizationId))
        );

        const stream = new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            let closed = false;
            let listener: ReturnType<typeof listenForEvents> | undefined;

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

            function send(eventType: string, data: string) {
              try {
                controller.enqueue(
                  enc.encode(`event: ${eventType}\ndata: ${data}\n\n`)
                );
              } catch {
                // client disconnected
              }
            }

            function closeStream(errorMessage?: string) {
              if (closed) return;
              closed = true;
              clearInterval(heartbeat);
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
                  void runApp(listVisibleCaseIdsEffect(organizationId))
                    .then((ids) => {
                      allowed = new Set(ids);
                      if (allowed.has(eventCaseId)) {
                        send(parsed.type, rawPayload);
                      }
                    })
                    .catch(() => {
                      // fail closed: without a visibility read the event is dropped
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
