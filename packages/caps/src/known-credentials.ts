import { CAPABILITIES } from "./registry";
import { credentialSpecSlots, type CredentialSlotMeta } from "./sdk";

/** A Vault slot in Settings' catalog. */
export type KnownCredential = CredentialSlotMeta;

/**
 * Vault slot catalog for Settings, derived from the Cap registry: every slot a Cap's
 * `credentials` names, once, in registry order. Adding a Cap that declares a new slot adds it
 * here with no second edit. A slot several Caps declare must carry identical metadata (a shared
 * constant, `src/credentials.ts`); a conflict throws.
 *
 * Naming: `WHOIS_API_KEY` is the WhoisXML API key for `network.whoisxml.lookup`
 * (source-axis Cap). `network.whois.lookup` is RDAP-only and does not use this slot.
 */
function deriveCatalog(): KnownCredential[] {
  const byName = new Map<string, KnownCredential>();
  for (const cap of CAPABILITIES) {
    for (const spec of cap.credentials ?? []) {
      for (const slot of credentialSpecSlots(spec)) {
        const seen = byName.get(slot.name);
        if (!seen) {
          byName.set(slot.name, slot);
        } else if (
          seen.label !== slot.label ||
          seen.description !== slot.description ||
          (seen.secret ?? true) !== (slot.secret ?? true)
        ) {
          throw new Error(
            `Credential ${slot.name} is declared twice with different metadata (${cap.id}): share one constant`
          );
        }
      }
    }
  }
  return [...byName.values()];
}

let catalog: readonly KnownCredential[] | undefined;

export function listKnownCredentials(): KnownCredential[] {
  catalog ??= deriveCatalog();
  return [...catalog];
}

/** Whether a vault slot holds a secret: every slot does unless its declaration says `secret: false`. */
export function isSecretCredential(name: string): boolean {
  return listKnownCredentials().find((k) => k.name === name)?.secret ?? true;
}
