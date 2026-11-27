import type { z } from "zod";

import type { ViewDnsReverseHostSnapshot } from "#tools/network";

import { interpretViewDnsReverseHost } from "../../lib/collect/viewdns-reverse-host";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { viewDnsReverseMxInput } from "./input";

type ViewDnsReverseMxInput = z.infer<typeof viewDnsReverseMxInput>;

/** Pure interpret: the domains ViewDNS lists on the mail server, as domain Identifiers. */
export function interpretViewDnsReverseMxReport(
  report: ViewDnsReverseHostSnapshot,
  opts: CapInterpretOpts<ViewDnsReverseMxInput>
): CapInterpretResult {
  return interpretViewDnsReverseHost(report, opts.input.entityId);
}
