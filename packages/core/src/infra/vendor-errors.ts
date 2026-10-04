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
        new InvalidError({ reason: tagged.message }),
    })
  );
}
