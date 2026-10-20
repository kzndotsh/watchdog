import "@tanstack/react-start/server-only";
/**
 * Request body limit for every route that reads a body (the `/api/v1` OpenAPI handler,
 * Better Auth, server functions). One definition, `REQUEST_BODY_MAX_BYTES` in
 * `@watchdog/schemas`; `server.ts` applies it before the Start handler, and
 * `scripts/serve.mjs` hands the same number to srvx as a backstop for the container.
 *
 * Evidence files never pass through here: they go to the object store with a presigned
 * PUT, and `MAX_UPLOAD_BYTES` (`@watchdog/schemas`) bounds them separately.
 */
import { CSP_REPORT_PATH } from "@/lib/security-headers.server";
import { REQUEST_BODY_MAX_BYTES } from "@watchdog/schemas/shared";

/** Stable machine-readable code of a body-limit refusal (`data.code`). */
export const PAYLOAD_TOO_LARGE_CODE = "payload_too_large";

/** Methods whose body is read; the others never get a limit check. */
const BODYLESS_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** 413 in the shape of an API error, so clients handle it like the others. Never echoes the request. */
export function payloadTooLargeResponse(maxBytes: number): Response {
  return Response.json(
    {
      defined: false,
      code: "PAYLOAD_TOO_LARGE",
      status: 413,
      message: "Request body too large",
      data: { code: PAYLOAD_TOO_LARGE_CODE, maxBytes },
    },
    { status: 413, headers: { "Cache-Control": "no-store" } }
  );
}

/** A cancelled stream that is already closed or errored has nothing left to say. */
function ignore(): void {
  // nothing to do: the answer is the 413
}

/** The declared `Content-Length`, or `null` when absent or not a plain number. */
function declaredLength(request: Request): number | null {
  const header = request.headers.get("content-length");
  return header !== null && /^\d+$/.test(header) ? Number(header) : null;
}

/** The body as bytes, or `null` once it passes `maxBytes` (the stream is cancelled, not read on). */
async function readCapped(
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each read depends on the one before
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      // Tell the sender to stop: the rest of the body is never read.
      // oxlint-disable-next-line eslint/no-await-in-loop -- the loop ends here
      await reader.cancel().catch(ignore);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Routes that read their own body under a smaller limit, streaming: the global read would
 * buffer up to `REQUEST_BODY_MAX_BYTES` of a report the route refuses past a few KiB.
 */
const ROUTE_OWNED_LIMITS: ReadonlySet<string> = new Set([CSP_REPORT_PATH]);

/**
 * The request to hand to the handler, or the 413 to answer with. A declared length over
 * the limit is refused without reading a byte. A body with no declared length (chunked
 * transfer) is read up to the limit and handed on as bytes, so a client cannot dodge the
 * limit by not declaring a size; a declared length within the limit is passed through,
 * because HTTP framing stops the body at the length it declared.
 */
export async function enforceBodyLimit(
  request: Request,
  maxBytes: number = REQUEST_BODY_MAX_BYTES
): Promise<Request | Response> {
  if (BODYLESS_METHODS.has(request.method) || request.body === null) {
    return request;
  }
  if (ROUTE_OWNED_LIMITS.has(new URL(request.url).pathname)) return request;
  const declared = declaredLength(request);
  if (declared !== null) {
    if (declared <= maxBytes) return request;
    await request.body.cancel().catch(ignore);
    return payloadTooLargeResponse(maxBytes);
  }
  const bytes = await readCapped(request.body, maxBytes);
  if (bytes === null) return payloadTooLargeResponse(maxBytes);
  const headers = new Headers(request.headers);
  headers.delete("transfer-encoding");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: bytes,
    signal: request.signal,
  });
}
