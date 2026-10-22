/** Wire-safe Cap / playbook credential specs (Jobs catalog). */
export type CredentialSpecWire =
  | { name: string; optional?: boolean }
  | { anyOf: string[] };

/** First unsatisfied required spec, or undefined when the vault covers the Cap. */
export function missingCredentialNames(
  specs: readonly CredentialSpecWire[] | undefined,
  configured: ReadonlySet<string>
): string[] | undefined {
  for (const spec of specs ?? []) {
    if ("anyOf" in spec) {
      if (!spec.anyOf.some((n) => configured.has(n))) {
        return [...spec.anyOf];
      }
      continue;
    }
    if (spec.optional === true) continue;
    if (!configured.has(spec.name)) return [spec.name];
  }
  return undefined;
}

/** What the operator setting and the vault say about a catalog entry, for one viewer. */
export type CatalogGate = {
  /** The operator's breach setting keeps the entry from running. */
  isBreachOff: boolean;
  /** First unsatisfied required credential spec, or undefined when the vault covers it. */
  missingCredentials: string[] | undefined;
};

/**
 * The one entry-level run gate: Collect's Cap and Playbook run forms and the Library's
 * readiness both read it, so they cannot disagree. The Case's third-party egress switch and
 * the typed input belong to the run form and are not part of it.
 */
export function catalogGate(
  entry: {
    disabledReason?: "breach_disabled";
    credentials: readonly CredentialSpecWire[] | undefined;
  },
  configured: ReadonlySet<string>
): CatalogGate {
  return {
    isBreachOff: entry.disabledReason === "breach_disabled",
    missingCredentials: missingCredentialNames(entry.credentials, configured),
  };
}

export function missingCredentialReason(
  names: readonly string[],
  subject: "Cap" | "playbook"
): string {
  const target = subject === "Cap" ? "this Cap" : "this playbook";
  if (names.length === 1) {
    return `Connect ${names[0]} in Settings before running ${target}`;
  }
  return `Connect one of ${names.join(" | ")} in Settings before running ${target}`;
}
