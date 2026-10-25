import { Effect } from "effect";

import { listKnownCredentials } from "@watchdog/caps";

import { breachCapsEnabled } from "../caps/breach-caps";
import { breachOnlyCredentialNames } from "../caps/catalog";
import type { DomainTag } from "./tagged-errors";
import {
  listCredentialMetaEffect,
  putCredentialEffect,
  type CredentialMeta,
  type Vault,
} from "./vault";

/** Metadata slot for Settings / credentials API — never plaintext. */
export type CredentialSlot = {
  name: string;
  label: string;
  description: string;
  configured: boolean;
  updatedAt: string | null;
  /** Only breach Caps read this slot and `WD_BREACH_CAPS` is off: the key is stored but unused. */
  breachDisabled: boolean;
};

function isBreachDisabled(name: string): boolean {
  return !breachCapsEnabled() && breachOnlyCredentialNames().has(name);
}

function slotFromMeta(meta: CredentialMeta): CredentialSlot {
  const known = listKnownCredentials().find((k) => k.name === meta.name);
  return {
    name: meta.name,
    label: known?.label ?? meta.label ?? meta.name,
    description: known?.description ?? "Custom credential",
    configured: true,
    updatedAt: meta.updatedAt,
    breachDisabled: isBreachDisabled(meta.name),
  };
}

function slotsFromStored(stored: CredentialMeta[]): CredentialSlot[] {
  const known = listKnownCredentials();
  const byName = new Map(stored.map((s) => [s.name, s]));

  const slots: CredentialSlot[] = known.map((k) => {
    const row = byName.get(k.name);
    return {
      name: k.name,
      label: k.label,
      description: k.description,
      configured: row !== undefined,
      updatedAt: row?.updatedAt ?? null,
      breachDisabled: isBreachDisabled(k.name),
    };
  });

  for (const row of stored) {
    if (known.some((k) => k.name === row.name)) continue;
    slots.push(slotFromMeta(row));
  }

  return slots;
}

export function listCredentialSlotsEffect(
  userId: string
): Effect.Effect<CredentialSlot[], DomainTag, Vault> {
  return listCredentialMetaEffect(userId).pipe(
    Effect.map((stored) => slotsFromStored(stored))
  );
}

type PutCredentialSlotInput = {
  userId: string;
  name: string;
  secret: string;
  label?: string | null;
};

export function putCredentialSlotEffect(
  input: PutCredentialSlotInput
): Effect.Effect<CredentialSlot, DomainTag, Vault> {
  return putCredentialEffect(input).pipe(
    Effect.map((meta) => slotFromMeta(meta))
  );
}
