import { z } from "zod";

/**
 * What a breach lookup keeps of a recovered password or password hash (`WD_BREACH_CAPS`).
 *
 * - `full`: the value itself, as the provider returned it.
 * - `safe`: only `CredentialAttrs`: whether one was present, what kind it is, how long it is
 *   and a keyed reuse fingerprint. The value never reaches the artifact.
 *
 * The fingerprint is computed by the caller of this module (`CredentialFingerprint`): the key
 * behind it lives in `@watchdog/core` and never enters the Caps or tools.
 */
export const BREACH_CREDENTIAL_MODES = ["safe", "full"] as const;

export type BreachCredentialMode = (typeof BREACH_CREDENTIAL_MODES)[number];

/** A plaintext password and a password hash are different values; each is fingerprinted as its own role. */
export type CredentialRole = "plaintext" | "hash";

/**
 * Keyed reuse fingerprint of one exact value (HMAC-SHA256, lower-case hex). The same value in
 * the same role gives the same fingerprint on one instance; a plaintext and a hash never match.
 */
export type CredentialFingerprint = (
  value: string,
  role: CredentialRole
) => string;

/** What a Cap does with credential fields: which mode, and the fingerprint function for `safe`. */
export type CredentialHandling = {
  readonly mode: BreachCredentialMode;
  readonly fingerprint: CredentialFingerprint;
};

export const CREDENTIAL_KINDS = [
  "plaintext",
  "bcrypt",
  "argon2",
  "md5",
  "sha1",
  "sha256",
  "sha512",
  "unknown",
] as const;

export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const credentialAttrsSchema = z.discriminatedUnion("present", [
  z.object({ present: z.literal(false) }),
  z.object({
    present: z.literal(true),
    kind: z.enum(CREDENTIAL_KINDS),
    length: z.number().int().positive(),
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  }),
]);

export type CredentialAttrs = z.infer<typeof credentialAttrsSchema>;

const HEX_KIND_BY_LENGTH: Readonly<Record<number, CredentialKind>> = {
  32: "md5",
  40: "sha1",
  64: "sha256",
  128: "sha512",
};

const BCRYPT = /^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/;
const ARGON2 = /^\$argon2(?:id|i|d)\$/;
const HEX = /^[\da-f]+$/i;

/**
 * The hash type of a password hash string, from its format alone. Conservative: only a bcrypt or
 * Argon2 prefix, or a bare hex string of exactly 32, 40, 64 or 128 characters, is named;
 * anything else is `unknown`. A 32-character hex string is reported as `md5`, though an NTLM
 * hash looks the same.
 */
export function hashKind(value: string): CredentialKind {
  if (BCRYPT.test(value)) return "bcrypt";
  if (ARGON2.test(value)) return "argon2";
  if (HEX.test(value)) return HEX_KIND_BY_LENGTH[value.length] ?? "unknown";
  return "unknown";
}

/** Kind and length of one credential value, without a fingerprint. */
export function credentialShape(
  value: string,
  role: CredentialRole
): { kind: CredentialKind; length: number } {
  return {
    kind: role === "plaintext" ? "plaintext" : hashKind(value),
    length: value.length,
  };
}

/** The safe-mode attributes of one value: nothing of the value itself except its keyed fingerprint. */
export function credentialAttrs(
  value: string | null,
  role: CredentialRole,
  fingerprint: CredentialFingerprint
): CredentialAttrs {
  if (value === null || value === "") return { present: false };
  return {
    present: true,
    ...credentialShape(value, role),
    fingerprint: fingerprint(value, role),
  };
}

/** The attributes of a record's password and password hash. */
export type CredentialPair = {
  readonly password: CredentialAttrs;
  readonly hash: CredentialAttrs;
};

export function credentialPair(
  plaintext: string | null,
  hash: string | null,
  fingerprint: CredentialFingerprint
): CredentialPair {
  return {
    password: credentialAttrs(plaintext, "plaintext", fingerprint),
    hash: credentialAttrs(hash, "hash", fingerprint),
  };
}

export const credentialReuseSchema = z.object({
  role: z.enum(["plaintext", "hash"]),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  records: z.number().int().min(2),
});

export type CredentialReuse = z.infer<typeof credentialReuseSchema>;

/** Most reuse groups a snapshot lists. */
const REUSE_CAP = 10;

/**
 * Values shared by two or more records of one result: the same plaintext password, or the same
 * hash string. Largest group first; fingerprints only. A plaintext and a hash are never grouped.
 */
export function credentialReuse(
  pairs: readonly CredentialPair[]
): CredentialReuse[] {
  const counts = new Map<string, CredentialReuse>();
  const add = (role: CredentialRole, attrs: CredentialAttrs) => {
    if (!attrs.present) return;
    const key = `${role}:${attrs.fingerprint}`;
    const seen = counts.get(key);
    counts.set(key, {
      role,
      fingerprint: attrs.fingerprint,
      records: (seen?.records ?? 0) + 1,
    });
  };
  for (const { password, hash } of pairs) {
    add("plaintext", password);
    add("hash", hash);
  }
  return [...counts.values()]
    .filter((group) => group.records >= 2)
    .sort(
      (a, b) =>
        b.records - a.records || a.fingerprint.localeCompare(b.fingerprint)
    )
    .slice(0, REUSE_CAP);
}

/** One credential field of an entry, in either mode: the value (`full`) or its attributes (`safe`). */
export type CredentialField = string | null | CredentialAttrs;

/** Short text for a credential field that never carries the value: `plaintext, 7 chars`. */
export function describeCredential(
  field: CredentialField,
  role: CredentialRole
): string | null {
  if (field === null) return null;
  if (typeof field === "string") {
    if (field === "") return null;
    const { kind, length } = credentialShape(field, role);
    return `${kind}, ${length} chars`;
  }
  return field.present ? `${field.kind}, ${field.length} chars` : null;
}

/** `ab12cd34…`: the part of a fingerprint a report quotes. */
export function shortFingerprint(fingerprint: string): string {
  return `${fingerprint.slice(0, 8)}…`;
}

/** One line per reuse group, for a report: `3 records share a password (fingerprint ab12cd34…)`. */
export function describeReuse(reuse: readonly CredentialReuse[]): string[] {
  return reuse.map(
    ({ role, fingerprint, records }) =>
      `${records} records share a ${role === "plaintext" ? "password" : "password hash"} (fingerprint ${shortFingerprint(fingerprint)})`
  );
}
