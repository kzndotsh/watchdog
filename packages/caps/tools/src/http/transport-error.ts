import { HttpClientError } from "effect/http";

import { isToolsTag } from "../errors/map-tools-catch";

/**
 * The typed tools failure (a blocked target, a limit hit) the outbound client
 * raised inside an `HttpClientError` transport failure, or the error itself
 * when there is none.
 */
export function transportFailure(error: unknown): unknown {
  if (
    HttpClientError.isHttpClientError(error) &&
    "cause" in error.reason &&
    isToolsTag(error.reason.cause)
  ) {
    return error.reason.cause;
  }
  return error;
}
