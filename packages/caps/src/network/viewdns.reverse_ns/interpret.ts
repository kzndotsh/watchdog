import type { z } from "zod";

import type { ViewDnsReverseHostSnapshot } from "#tools/network";

import { interpretViewDnsReverseHost } from "../../lib/collect/viewdns-reverse-host";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { viewDnsReverseNsInput } from "./input";

type ViewDnsReverseNsInput = z.infer<typeof viewDnsReverseNsInput>;

/** Pure interpret: the domains ViewDNS lists on the nameserver, as domain Identifiers. */
export function interpretViewDnsReverseNsReport(
  report: ViewDnsReverseHostSnapshot,
  opts: CapInterpretOpts<ViewDnsReverseNsInput>
): CapInterpretResult {
  return interpretViewDnsReverseHost(report, opts.input.entityId);
}
