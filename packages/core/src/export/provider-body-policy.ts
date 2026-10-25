import {
  CAPABILITIES,
  isBreachCap,
  redistributionVerdictFor,
  type RedistributionVerdict,
} from "@watchdog/caps";
import type { ProviderCallWithOutcome } from "@watchdog/db";
import { fixedContactHost, type CapContact } from "@watchdog/schemas/caps";
import { contactAdmits, type Touch } from "@watchdog/tools/http";

/**
 * Why a stored raw response is not in the Export. The envelope in `provider-calls.jsonl` always
 * carries the body's hash and size; a withheld body carries one of these codes and its fixed
 * explanation, never a message that could name a target.
 */
export const RAW_BODY_WITHHELD = {
  not_stored: "No raw response is stored for this call.",
  breach: "Responses of breach Caps are never exported.",
  target:
    "The response came from a host the input named, not from a fixed provider host.",
  redistribution_unknown:
    "The provider's terms on redistributing responses are not recorded as permitting it.",
  redistribution_forbidden:
    "The provider's terms do not allow its responses to be redistributed.",
  not_opted_in:
    "An owner or admin did not include raw responses in this Export.",
  unreadable:
    "The stored response could not be read back or no longer matches its hash.",
} as const;

export type RawBodyWithheldReason = keyof typeof RAW_BODY_WITHHELD;

export type RawBodyDecision =
  | { readonly include: true }
  | { readonly include: false; readonly reason: RawBodyWithheldReason };

/** The terms lookup of a host; the reviewed register unless a test supplies another. */
export type RedistributionLookup = (host: string) => RedistributionVerdict;

/** The Export's options. `shouldIncludeRawBodies` is the owner or admin's per-Export opt-in. */
export type CaseExportOptions = {
  readonly shouldIncludeRawBodies: boolean;
  /** Defaults to the reviewed register (`redistributionVerdictFor`); a seam for tests. */
  readonly redistributionVerdictFor?: RedistributionLookup;
};

/** The default: nobody opted in, so no raw response is exported. */
export const NO_RAW_BODIES: CaseExportOptions = {
  shouldIncludeRawBodies: false,
};

/** Where a call went first: its transport and the host or name it touched. */
function firstTouch(call: ProviderCallWithOutcome["call"]): Touch | null {
  try {
    switch (call.transport) {
      case "http": {
        return {
          transport: "http",
          host: new URL(call.urlRedacted).hostname,
          hop: 0,
        };
      }
      case "tls": {
        return {
          transport: "tls",
          host: new URL(call.urlRedacted).hostname,
          hop: 0,
        };
      }
      case "dns": {
        // `dns:<name>?type=<rrtype>`
        const name = call.urlRedacted.slice("dns:".length).split("?")[0] ?? "";
        return name === "" ? null : { transport: "dns", host: name, hop: 0 };
      }
      default: {
        call.transport satisfies never;
        return null;
      }
    }
  } catch {
    return null;
  }
}

const TOUCH_VIA = { http: "http", tls: "tls", dns: "dns" } as const;

function capContacts(capabilityId: string): readonly CapContact[] | undefined {
  return CAPABILITIES.find((cap) => cap.id === capabilityId)?.contacts;
}

const VERDICT_RANK: Record<RedistributionVerdict, number> = {
  allowed: 0,
  unknown: 1,
  forbidden: 2,
};

/**
 * Whether the raw response of one call may go into the Export. The one rule, used by the size
 * pass and the archive alike. Every condition must hold, and the answer is the first that fails:
 *
 * - the body is stored (`not_stored`);
 * - an owner or admin opted in for this Export (`not_opted_in`);
 * - the Cap is not a breach Cap (`breach`, from its id, as storage does);
 * - the body did not come from a user target: a fixed contact of the Cap admits the host, and
 *   the Cap declares no `target` contact on the same transport (`target`; a host the input could
 *   have named is never treated as fixed);
 * - the host's reviewed verdict is `allowed` (`redistribution_*`; a Cap or host nobody reviewed
 *   is `unknown`, which withholds).
 */
export function rawBodyDecision(
  { call, outcome, job }: ProviderCallWithOutcome,
  options: CaseExportOptions
): RawBodyDecision {
  if (
    outcome === null ||
    outcome.bodyState !== "stored" ||
    outcome.blobKey === null
  ) {
    return { include: false, reason: "not_stored" };
  }
  if (!options.shouldIncludeRawBodies) {
    return { include: false, reason: "not_opted_in" };
  }
  if (isBreachCap({ id: job.capabilityId })) {
    return { include: false, reason: "breach" };
  }
  const contacts = capContacts(job.capabilityId);
  const touch = firstTouch(call);
  if (contacts === undefined || touch === null) {
    return { include: false, reason: "redistribution_unknown" };
  }
  const isTargetPossible = contacts.some(
    (contact) =>
      contact.kind === "target" && contact.via === TOUCH_VIA[touch.transport]
  );
  const fixed = contacts.filter(
    (contact) =>
      contact.kind !== "target" &&
      contact.kind !== "model" &&
      contactAdmits(contact, touch, [])
  );
  if (isTargetPossible || fixed.length === 0) {
    return { include: false, reason: "target" };
  }
  const verdictFor =
    options.redistributionVerdictFor ?? redistributionVerdictFor;
  // Every admitting contact must allow it: the least permissive verdict decides.
  let worst: RedistributionVerdict = "allowed";
  for (const contact of fixed) {
    const host = fixedContactHost(contact);
    const verdict = host === undefined ? "unknown" : verdictFor(host);
    if (VERDICT_RANK[verdict] > VERDICT_RANK[worst]) worst = verdict;
  }
  if (worst === "forbidden") {
    return { include: false, reason: "redistribution_forbidden" };
  }
  if (worst !== "allowed") {
    return { include: false, reason: "redistribution_unknown" };
  }
  return { include: true };
}
