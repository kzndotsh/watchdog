/**
 * What a Job's `Egress` admits: the running Cap's declared contacts (`contacts` on the Cap,
 * the single source), read against the host a request or a name touches. Core builds one
 * `EgressPolicy` per Job from `cap.contacts` and the Job input (`egressPolicyFor`); the
 * `Egress` checks it on every HTTP hop, every DNS name and every TLS peer, and a refusal is a
 * `BlockedTargetError` with a fixed message that never names the target. No policy means the
 * `Egress` admits everything the address guard allows (tests, scripts).
 *
 * Per contact kind:
 * - `provider`: its host, over HTTP; with `redirects: "any_public"` also any host on a
 *   redirect hop.
 * - `download`: the host of its URL, but the first request to it must be a body-less GET of
 *   exactly that URL carrying no seed value in its headers (`seed` otherwise).
 * - `target`: over HTTP the host the input names and any host on a redirect hop (any host at
 *   all with `anyHost`, for a Cap that makes one call per hop); over DNS or TLS the input's
 *   name or a name under it (`_dmarc.<name>`).
 * - `dns`: a name in the zone.
 * - `model`: nothing here; model calls go through `llmFetchFor`.
 *
 * The address guard (`assertAllowedTarget`, the connect-time lookup) still runs on every hop
 * after this check, so a host this admits is never exempt from it.
 */
import { isIP } from "node:net";

import { BlockedTargetError } from "../errors/tagged-errors";
import { normalizeHost } from "../whois/normalize";
import { bareHost } from "./outbound-policy";

/** A declared contact; structurally the same as `CapContact` in `@watchdog/schemas/caps`. */
export type PolicyContact =
  | {
      readonly kind: "provider";
      readonly host: string;
      readonly redirects?: "any_public";
    }
  | { readonly kind: "download"; readonly url: string }
  | {
      readonly kind: "target";
      readonly via: "http" | "tls" | "dns";
      readonly anyHost?: true;
    }
  | { readonly kind: "dns"; readonly zone: string }
  | { readonly kind: "model" };

export type EgressPolicy = {
  readonly contacts: readonly PolicyContact[];
  /** Host names and addresses the Job input names, normalized. */
  readonly targetNames: readonly string[];
  /** Values of the Job input a download request must not carry, in each form they may take. */
  readonly seedNeedles: readonly string[];
};

/** Where a request or a name goes. `hop` is 0 for the host a call was made to. */
export type Touch = {
  readonly transport: "http" | "dns" | "tls";
  readonly host: string;
  readonly hop: number;
};

/** The request side a hop check reads. */
export type HopRequest = {
  readonly url: URL;
  readonly hop: number;
  readonly method: string;
  readonly headers: readonly (readonly [string, string])[];
  readonly hasBody: boolean;
};

/** Seed values shorter than this are not scanned for: they would match anything. */
const MIN_SEED_LENGTH = 4;
const MAX_INPUT_DEPTH = 4;

function canonicalName(raw: string): string {
  const name = normalizeHost(raw).replace(/^\[/, "").replace(/\]$/, "");
  if (isIP(name) === 6) {
    try {
      return bareHost(new URL(`http://[${name}]/`));
    } catch {
      return name;
    }
  }
  return name;
}

/** The names one input string may stand for: a URL's host, an email's domain, a bare host or address. */
function namesOf(value: string): string[] {
  const text = value.trim();
  if (text === "") return [];
  const names = new Set<string>();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      names.add(canonicalName(bareHost(new URL(text))));
    } catch {
      // Not a URL after all: the bare-host reading below still applies.
    }
  }
  const at = text.lastIndexOf("@");
  if (at !== -1) names.add(canonicalName(text.slice(at + 1)));
  names.add(canonicalName(text));
  names.delete("");
  return [...names];
}

function scalars(
  value: unknown,
  depth: number,
  out: (string | number)[]
): void {
  if (typeof value === "string" || typeof value === "number") {
    out.push(value);
  } else if (depth < MAX_INPUT_DEPTH && Array.isArray(value)) {
    for (const item of value) scalars(item, depth + 1, out);
  } else if (
    depth < MAX_INPUT_DEPTH &&
    typeof value === "object" &&
    value !== null
  ) {
    for (const item of Object.values(value)) scalars(item, depth + 1, out);
  }
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * The policy for one Job: the Cap's contacts, the names its input points at, and the input's
 * values as the needles of the seed scan (raw, lower-cased, host-normalized, percent-encoded;
 * numbers by their digits).
 */
export function egressPolicyFor(
  contacts: readonly PolicyContact[],
  input: unknown
): EgressPolicy {
  const values: (string | number)[] = [];
  scalars(input, 0, values);
  const targetNames = new Set<string>();
  const needles = new Set<string>();
  for (const value of values) {
    const text = typeof value === "number" ? String(value) : value.trim();
    if (typeof value === "string") {
      for (const name of namesOf(text)) targetNames.add(name);
    }
    const forms = [
      text,
      text.toLowerCase(),
      normalizeHost(text),
      encodeURIComponent(text),
    ];
    for (const form of forms) {
      if (form.length >= MIN_SEED_LENGTH) needles.add(form.toLowerCase());
    }
  }
  return { contacts, targetNames: [...targetNames], seedNeedles: [...needles] };
}

function inZone(name: string, zone: string): boolean {
  return name === zone || name.endsWith(`.${zone}`);
}

/** Whether one contact admits where a request or a name goes. The only copy of these rules. */
export function contactAdmits(
  contact: PolicyContact,
  touch: Touch,
  targetNames: readonly string[]
): boolean {
  const host = canonicalName(touch.host);
  switch (contact.kind) {
    case "provider": {
      return (
        touch.transport === "http" &&
        (canonicalName(contact.host) === host ||
          (contact.redirects === "any_public" && touch.hop > 0))
      );
    }
    case "download": {
      return (
        touch.transport === "http" &&
        canonicalName(new URL(contact.url).hostname) === host
      );
    }
    case "target": {
      if (contact.via === "http") {
        return (
          touch.transport === "http" &&
          (contact.anyHost === true ||
            touch.hop > 0 ||
            targetNames.includes(host))
        );
      }
      return (
        touch.transport === contact.via &&
        targetNames.some((name) => inZone(host, name))
      );
    }
    case "dns": {
      return (
        touch.transport === "dns" && inZone(host, canonicalName(contact.zone))
      );
    }
    case "model": {
      return false;
    }
    default: {
      contact satisfies never;
      return false;
    }
  }
}

function carriesSeed(policy: EgressPolicy, request: HopRequest): boolean {
  return request.headers.some(([name, value]) => {
    const text = `${name}\n${value}`.toLowerCase();
    const decoded = safeDecode(text);
    return policy.seedNeedles.some(
      (needle) => text.includes(needle) || decoded.includes(needle)
    );
  });
}

/** True when `request` is a body-less GET of exactly `contact`'s URL with no seed in its headers. */
function isFixedDownload(
  policy: EgressPolicy,
  contact: Extract<PolicyContact, { kind: "download" }>,
  request: HopRequest
): boolean {
  return (
    request.method.toUpperCase() === "GET" &&
    !request.hasBody &&
    request.url.href === new URL(contact.url).href &&
    !carriesSeed(policy, request)
  );
}

/**
 * Refuses an HTTP hop no contact admits (`undeclared`). A hop that only a `download` contact
 * admits must be the fixed request (`seed` otherwise): the exact URL is the guarantee that no
 * Case data is in it, the header scan only catches an authoring mistake. Called on every hop
 * of every call, so a redirect cannot leave the declaration.
 */
export function assertHopAdmitted(
  policy: EgressPolicy,
  request: HopRequest
): void {
  const touch: Touch = {
    transport: "http",
    host: bareHost(request.url),
    hop: request.hop,
  };
  const admitting = policy.contacts.filter((contact) =>
    contactAdmits(contact, touch, policy.targetNames)
  );
  if (admitting.length === 0)
    throw new BlockedTargetError({ reason: "undeclared" });
  if (request.hop > 0 || admitting.some((c) => c.kind !== "download")) return;
  const fixed = admitting.some(
    (c) => c.kind === "download" && isFixedDownload(policy, c, request)
  );
  if (!fixed) throw new BlockedTargetError({ reason: "seed" });
}

/** Refuses a DNS name or TLS peer no contact admits (`undeclared`). */
export function assertNameAdmitted(
  policy: EgressPolicy,
  transport: "dns" | "tls",
  name: string
): void {
  const touch: Touch = { transport, host: name, hop: 0 };
  if (
    !policy.contacts.some((contact) =>
      contactAdmits(contact, touch, policy.targetNames)
    )
  ) {
    throw new BlockedTargetError({ reason: "undeclared" });
  }
}
