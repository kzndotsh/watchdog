import { z } from "zod";

import { EGRESS_CLASSES, type EgressClass } from "./vocab-egress";

/**
 * A Contact is who a Cap talks to, declared once on the Cap (`contacts`). Everything else about
 * its egress derives from the list: the egress classes (`deriveEgressClasses`), the
 * destinations a blocked step names (`egressDestinations`) and the hosts a Job may touch.
 *
 * - `provider`: a fixed host that receives Case data (the seed), anonymous or with the
 *   operator's key. `redirects: "any_public"` says the host answers by redirecting to
 *   registries or mirrors it cannot name in advance (RDAP bootstrap).
 * - `download`: a body-less GET of a fixed URL. The seed is never part of the request.
 * - `target`: the host the input names (`via` is the transport: HTTP follows redirects to any
 *   public host, TLS and DNS stay on the input's own name).
 * - `dns`: DNS questions under a fixed zone (the name carries the seed to that zone's servers).
 * - `model`: the configured AI model endpoint.
 */
export type CapContact =
  | {
      kind: "provider";
      host: string;
      access: "anonymous" | "keyed";
      redirects?: "any_public";
    }
  | { kind: "download"; url: string }
  | { kind: "target"; via: "http" | "tls" | "dns"; anyHost?: true }
  | { kind: "dns"; zone: string }
  | { kind: "model" };

export const capContactSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("provider"),
    host: z.string(),
    access: z.enum(["anonymous", "keyed"]),
    redirects: z.literal("any_public").optional(),
  }),
  z.object({ kind: z.literal("download"), url: z.string() }),
  z.object({
    kind: z.literal("target"),
    via: z.enum(["http", "tls", "dns"]),
    anyHost: z.literal(true).optional(),
  }),
  z.object({ kind: z.literal("dns"), zone: z.string() }),
  z.object({ kind: z.literal("model") }),
]);

/** The class one contact puts a Cap in. */
export function contactEgressClass(contact: CapContact): EgressClass {
  switch (contact.kind) {
    case "provider": {
      return contact.access === "keyed" ? "account_lookup" : "public_lookup";
    }
    case "download":
    case "dns": {
      return "public_lookup";
    }
    case "target": {
      return "target";
    }
    case "model": {
      return "model";
    }
    default: {
      contact satisfies never;
      return "local";
    }
  }
}

/**
 * The one derivation of a Cap's egress classes: the class of each contact, in the order of
 * `EGRESS_CLASSES`, without duplicates. A Cap with no contacts is `local`. A Cap never states
 * its classes, so they cannot disagree with its contacts.
 */
export function deriveEgressClasses(
  contacts: readonly CapContact[]
): EgressClass[] {
  if (contacts.length === 0) return ["local"];
  const classes = new Set(contacts.map(contactEgressClass));
  return EGRESS_CLASSES.filter((c) => classes.has(c));
}

/** The host of a fixed URL (a `download` contact). */
export function downloadHost(contact: { url: string }): string {
  return new URL(contact.url).hostname;
}

function destinationLabel(contact: CapContact): string {
  switch (contact.kind) {
    case "provider": {
      return contact.host;
    }
    case "download": {
      return downloadHost(contact);
    }
    case "dns": {
      return `DNS zone ${contact.zone}`;
    }
    case "target": {
      return contact.via === "dns"
        ? "the DNS of the name you enter"
        : "the host you enter";
    }
    case "model": {
      return "the configured AI model endpoint";
    }
    default: {
      contact satisfies never;
      return "";
    }
  }
}

/**
 * Where a Cap's contacts of the given classes send the seed, as short phrases for a blocked
 * step: hosts for fixed contacts, a description for the ones the input or the endpoint
 * settings decide. Without `classes`, every class counts. Deduplicated, in contact order.
 */
export function egressDestinations(
  contacts: readonly CapContact[],
  classes?: readonly EgressClass[]
): string[] {
  const out: string[] = [];
  for (const contact of contacts) {
    if (
      classes !== undefined &&
      !classes.includes(contactEgressClass(contact))
    ) {
      continue;
    }
    const label = destinationLabel(contact);
    if (!out.includes(label)) out.push(label);
  }
  return out;
}
