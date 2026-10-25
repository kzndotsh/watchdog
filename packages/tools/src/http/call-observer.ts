/**
 * The hook `outboundFetch` offers one call (`SafeFetchInit.observer`). The Job's ledger builds
 * one per call. Absent, the client behaves exactly as without a ledger. An observer only
 * watches: it never changes a request, a response or an error, and a throw from one is a bug.
 */
export type CallObserver = {
  /** A hop is about to be checked and sent (beside `assertAllowedTarget`); a refused hop is still seen here. */
  readonly hop: (url: URL) => void;
  /** One wire attempt of the current hop ended: the response status, or the transport error. */
  readonly attempt: (
    outcome: { readonly status: number } | { readonly error: unknown }
  ) => void;
  /**
   * The final response, body not yet read. Returns the response the caller receives: the
   * same one, or one whose body is tapped as the consumer pulls it. `truncated` tells, once
   * the body has ended, whether `limits.truncate` cut it.
   */
  readonly settle: (
    response: Response,
    info: { readonly url: URL; readonly truncated: () => boolean }
  ) => Response;
  /** The call failed before it returned a response (a refusal, a limit, a transport error, an abort). */
  readonly failed: (error: unknown) => void;
};
