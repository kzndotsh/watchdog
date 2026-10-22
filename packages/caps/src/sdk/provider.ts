/**
 * Who a Cap gets its data from, and on what terms. Required on every Cap
 * (`CapabilityDef.provider`), so a new Cap cannot ship without it. Values come from the
 * provider's own published terms: when they are unclear or unreachable, `commercialUse`
 * is `"unknown"`, never a guess. Caps that share a provider share one constant in
 * `src/providers/`. The register (`docs/reference/platform/cap-register.md`) is generated
 * from these.
 */

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
};

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
