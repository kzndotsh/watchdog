/** What a body tap reports as the consumer reads. */
export type BodySink = {
  /** A chunk the consumer is receiving, in order. */
  readonly chunk: (value: Uint8Array) => void;
  /** The body ended: the consumer read to the end. */
  readonly end: () => void;
  /** The consumer cancelled the stream before the end. */
  readonly cancelled: () => void;
  /** Reading the body failed. */
  readonly failed: (error: unknown) => void;
};

/**
 * Re-wraps a response so `sink` sees every byte the consumer receives, as it receives it.
 * The wrapper holds no queue (`highWaterMark: 0`): it reads from the source only while the
 * consumer has a read pending, never ahead, so what is hashed is exactly what was delivered.
 * Status, headers and `url` are kept; a response without a body is returned as it is.
 */
export function tapBody(
  response: Response,
  url: string,
  sink: BodySink
): Response {
  const reader = response.body?.getReader();
  if (reader === undefined) return response;
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await reader.read();
        } catch (error) {
          sink.failed(error);
          controller.error(error);
          return;
        }
        if (result.done) {
          sink.end();
          controller.close();
          return;
        }
        sink.chunk(result.value);
        controller.enqueue(result.value);
      },
      async cancel(reason) {
        sink.cancelled();
        await reader.cancel(reason).catch((error: unknown) => error);
      },
    },
    { highWaterMark: 0 }
  );
  const tapped = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers],
  });
  Object.defineProperty(tapped, "url", { value: url });
  return tapped;
}
