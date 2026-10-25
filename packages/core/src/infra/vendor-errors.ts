import { Match } from "effect";

import type { ToolsTag } from "@watchdog/tools/errors";

import { InternalError, InvalidError, type DomainTag } from "./tagged-errors";

/**
 * Vendor (`@watchdog/tools`) failure tag to core tag. Keyed by tag name and
 * exhaustive, so a new vendor tag fails typecheck until it is classified here.
 * Never reads a message to decide the class; the message is carried through
 * unchanged as the reason.
 *
 * - Upstream faults (rate limit, HTTP failure, unparseable response) are
 *   `InternalError`: the caller cannot fix them. The vendor tag is the cause.
 * - An unexpected tool fault (`UnexpectedToolError`) is `InternalError` too.
 * - A missing credential or rejected input is `InvalidError`: the caller can
 *   configure the credential or change the input.
 */
export function toDomainTag(error: ToolsTag): DomainTag {
  return Match.value(error).pipe(
    Match.tagsExhaustive({
      RateLimitedError: (tagged) =>
        new InternalError({ reason: tagged.message, cause: tagged }),
      HttpVendorError: (tagged) =>
        new InternalError({ reason: tagged.message, cause: tagged }),
      ParseVendorError: (tagged) =>
        new InternalError({ reason: tagged.message, cause: tagged }),
      MissingCredentialError: (tagged) =>
        new InvalidError({ reason: tagged.message }),
      ValidationVendorError: (tagged) =>
        new InvalidError({
          reason: tagged.message,
          ...(tagged.cause === undefined ? {} : { cause: tagged.cause }),
        }),
      // A refused caller target is input the caller can change; the server-side
      // reasons (a name that resolved to a refused address, proxy setup, a Cap that
      // declared too little: `undeclared`, `seed`) are not.
      BlockedTargetError: (tagged) =>
        tagged.reason === "resolved" ||
        tagged.reason === "proxy" ||
        tagged.reason === "unproxied" ||
        tagged.reason === "undeclared" ||
        tagged.reason === "seed"
          ? new InternalError({ reason: tagged.message, cause: tagged })
          : new InvalidError({ reason: tagged.message }),
      OutboundLimitError: (tagged) =>
        new InternalError({ reason: tagged.message, cause: tagged }),
      // The original fault, not the wrapper, so it survives into the log.
      UnexpectedToolError: (tagged) =>
        new InternalError({ reason: tagged.message, cause: tagged.cause }),
    })
  );
}
