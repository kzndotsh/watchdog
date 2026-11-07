import { fixedContactHost } from "@watchdog/schemas/caps";

/**
 * Who a Cap gets its data from, and on what terms. Required on every Cap
 * (`CapabilityDef.provider`), so a new Cap cannot ship without it. Values come from the
 * provider's own published terms: when they are unclear or unreachable, `commercialUse`
 * is `"unknown"`, never a guess. Caps that share a provider share one constant in
 * `src/providers/`. The register (`docs/reference/platform/cap-register.md`) is generated
 * from these.
 */

/**
 * Whether a provider's terms let a private Case Export carry its raw response bodies: an owner
 * or admin hands the zip to their own team, or to a client or lawyer they act for on that
 * matter. It is not about publishing the data, reselling it or feeding another lookup service
 * (the middleman case). The Export cannot tell who receives it, so a verdict is judged for the
 * stricter recipient, a client: terms that let your own employees, contractors or counsel see
 * the data but not a client (Censys, HoneyDB, WhoisXML) are not `allowed`. `allowed` only where the provider's own text permits that redistribution,
 * `forbidden` where it bars disclosure to any third party (not only resale), `unknown` when it
 * is silent, contradicts itself or could not be read. Only `allowed` releases a body; `unknown`
 * withholds it exactly as `forbidden` does, so a host nobody reviewed never leaks by default.
 */
export type RedistributionVerdict = "allowed" | "forbidden" | "unknown";

/** What the plan the Cap needs costs: `self` calls no third party. */
export type CapProviderTier = "free" | "freemium" | "paid" | "self";

/**
 * Commercial use of the plan the Cap needs: `allowed` only when the provider's text says
 * so, `restricted` when it needs a paid plan, a licence, or carries conditions,
 * `forbidden` when the terms prohibit it, `unknown` when they are silent or unreadable.
 */
export type CapCommercialUse =
  | "allowed"
  | "restricted"
  | "forbidden"
  | "unknown";

export type CapProviderAttribution = {
  /** The credit line the provider's terms ask for. */
  text: string;
  url: string;
};

export type CapProvider = {
  name: string;
  url: string;
  /** The page that governs API or data use (terms, API terms, licence or pricing). */
  termsUrl: string;
  tier: CapProviderTier;
  commercialUse: CapCommercialUse;
  /** Set only when the terms require credit; shown beside the Cap's Job output. */
  attribution?: CapProviderAttribution;
  /**
   * The redistribution verdict of each fixed contact host this provider answers on (the host of
   * a `provider` or `download` contact, the zone of a `dns` contact), in canonical form. Reviewed
   * by hand with `commercialUse`: a value changes only after someone reads the provider's terms,
   * never from a guess. A comment on the entry quotes the deciding text; an unannotated
   * `unknown` is silent or unreadable terms. A host belongs to one provider, so two Caps that
   * call one host share its verdict (and the credit line comes from `attribution`).
   * `redistribution.test.ts` fails when a Cap declares a host no provider lists, or a provider
   * lists a host no Cap declares, so a new vendor cannot ship unreviewed.
   *
   * Reviewed 2026-10-25 (#513) from each provider's terms, AUP, API docs, licence and FAQ pages.
   */
  hosts?: Readonly<Record<string, RedistributionVerdict>>;
};

function providerHostContact(host: string) {
  return { kind: "provider", host, access: "anonymous" } as const;
}

/** An absolute https URL with a dotted host and no whitespace. Parsed, not matched by a regex. */
function isHttpsUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Check a provider block: a name, https links, a non-empty credit when one is set, and a self
 * provider that allows commercial use. `defineProvider` and `defineCapability` both call it, so a
 * Cap with an inline provider is checked too.
 */
export function assertCapProvider(provider: CapProvider): void {
  if (!provider.name.trim()) {
    throw new Error("Provider name is required");
  }
  for (const [field, value] of [
    ["url", provider.url],
    ["termsUrl", provider.termsUrl],
    ["attribution.url", provider.attribution?.url],
  ] as const) {
    if (value !== undefined && !isHttpsUrl(value)) {
      throw new Error(
        `Provider ${provider.name}: ${field} must be an https URL`
      );
    }
  }
  if (provider.attribution !== undefined && !provider.attribution.text.trim()) {
    throw new Error(
      `Provider ${provider.name}: attribution.text must not be empty`
    );
  }
  for (const host of Object.keys(provider.hosts ?? {})) {
    if (fixedContactHost(providerHostContact(host)) !== host) {
      throw new Error(
        `Provider ${provider.name}: host ${host} is not in canonical form`
      );
    }
  }
  if (provider.tier === "self" && provider.commercialUse !== "allowed") {
    throw new Error(
      `Provider ${provider.name}: a self provider allows commercial use`
    );
  }
}

/** Identity helper so provider constants are checked against `CapProvider`. */
export function defineProvider(provider: CapProvider): CapProvider {
  assertCapProvider(provider);
  return provider;
}
