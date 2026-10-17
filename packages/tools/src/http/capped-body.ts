import { OutboundLimitError } from "../errors/tagged-errors";

/** Releases an unread body or reader; a failure to cancel is not worth surfacing. */
export async function discardBody(
  source: { cancel: () => Promise<void> } | null | undefined
): Promise<void> {
  await source?.cancel().catch((error: unknown) => error);
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export type CappedBodyOptions = {
  readonly maxBytes: number;
  /** At the limit: close the stream with what was read (true) or fail with `OutboundLimitError` (false). */
  readonly truncate: boolean;
  /** Called once when the body ends, fails or is cancelled (stops the request timer). */
  readonly onSettled: () => void;
  /** Called when the reader stops early so the connection is torn down. */
  readonly abort: () => void;
  /** Maps a read failure (for example the request timeout) to its typed error. */
  readonly mapError: (error: unknown) => unknown;
};

/**
 * Re-wraps a response so its body is streamed, never buffered whole, and read
 * only up to `maxBytes`. Status and headers are kept; `url` reports the final
 * hop so callers know where the content came from.
 */
export function cappedResponse(
  source: Response,
  finalUrl: string,
  options: CappedBodyOptions
): Response {
  const { maxBytes, truncate, onSettled, abort, mapError } = options;
  const init = {
    status: source.status,
    statusText: source.statusText,
    headers: source.headers,
  };
  const reader = source.body?.getReader();
  let response: Response;
  if (reader === undefined || NULL_BODY_STATUSES.has(source.status)) {
    onSettled();
    response = new Response(null, init);
  } else {
    let total = 0;
    const stop = async (): Promise<void> => {
      onSettled();
      abort();
      await discardBody(reader);
    };
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            onSettled();
            controller.close();
            return;
          }
          const room = maxBytes - total;
          if (value.byteLength <= room) {
            total += value.byteLength;
            controller.enqueue(value);
            if (truncate && total === maxBytes) {
              await stop();
              controller.close();
            }
            return;
          }
          await stop();
          if (truncate) {
            if (room > 0) controller.enqueue(value.slice(0, room));
            controller.close();
          } else {
            controller.error(
              new OutboundLimitError({ kind: "bytes", limit: maxBytes })
            );
          }
        } catch (error) {
          onSettled();
          controller.error(mapError(error));
        }
      },
      async cancel() {
        await stop();
      },
    });
    response = new Response(body, init);
  }
  Object.defineProperty(response, "url", { value: finalUrl });
  return response;
}

/** The declared `Content-Length` when it is a plain non-negative integer. */
export function declaredLength(headers: Headers): number | undefined {
  const raw = headers.get("content-length");
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}
