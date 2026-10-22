import { Effect } from "effect";

import {
  CAPABILITIES,
  isBreachCap,
  listCapabilities,
  listPlaybookDescriptors,
  toCapDescriptor,
  type CapDescriptor,
  type PlaybookDescriptor,
} from "@watchdog/caps";

import { BREACH_DISABLED, breachCapsEnabled } from "./breach-caps";

/** Why an entry cannot run right now, whatever the Case or vault says: the operator setting. */
export type CatalogDisabledReason = typeof BREACH_DISABLED;

export type CapabilityListing = CapDescriptor & {
  disabledReason?: CatalogDisabledReason;
};

export type PlaybookListing = PlaybookDescriptor & {
  disabledReason?: CatalogDisabledReason;
};

/** The catalog, each breach Cap marked `breach_disabled` while `WD_ENABLE_BREACH_CAPS` is off. */
export function listCapabilitiesEffect(): Effect.Effect<CapabilityListing[]> {
  return Effect.sync(() => {
    const enabled = breachCapsEnabled();
    return listCapabilities().map((cap) =>
      !enabled && isBreachCap(cap)
        ? { ...cap, disabledReason: BREACH_DISABLED }
        : cap
    );
  });
}

/** Playbooks, each one with a breach step marked `breach_disabled` while the setting is off. */
export function listPlaybookDescriptorsEffect(): Effect.Effect<
  PlaybookListing[]
> {
  return Effect.sync(() => {
    const enabled = breachCapsEnabled();
    return listPlaybookDescriptors().map((playbook) =>
      !enabled && playbook.requires.flags.includes("breach")
        ? { ...playbook, disabledReason: BREACH_DISABLED }
        : playbook
    );
  });
}

/**
 * Vault slots that only breach Caps read (an HIBP or DeHashed key): Settings explains these
 * while the setting is off. A slot a non-breach Cap also reads is never listed.
 */
export function breachOnlyCredentialNames(): ReadonlySet<string> {
  const breach = new Set<string>();
  const other = new Set<string>();
  for (const cap of CAPABILITIES) {
    const target = isBreachCap(cap) ? breach : other;
    for (const spec of toCapDescriptor(cap).credentials ?? []) {
      for (const name of "anyOf" in spec ? spec.anyOf : [spec.name]) {
        target.add(name);
      }
    }
  }
  return new Set([...breach].filter((name) => !other.has(name)));
}
