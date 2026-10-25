import { z } from "zod";

/** What a keyserver query asks for (mirrors `PgpQueryKind` in `@watchdog/schemas`, which tools does not import). */
export const pgpQueryKindSchema = z.enum([
  "email",
  "domain",
  "name",
  "key_id",
  "fingerprint",
]);
export type PgpQueryKind = z.infer<typeof pgpQueryKindSchema>;

/** The detected kind and the normalized value, as `classifyPgpQuery` returns them. */
export type PgpQueryInput = {
  readonly kind: PgpQueryKind;
  readonly value: string;
};

export const pgpUidSchema = z.object({
  /** The User ID as published, e.g. `Alice <alice@example.com>`. */
  text: z.string(),
  name: z.string().nullable(),
  /** Lowercased address parsed out of the User ID, when it has one. */
  email: z.string().nullable(),
  revoked: z.boolean(),
});

export const pgpKeySchema = z.object({
  /** Full 40 (v4) or 64 (v6) hex fingerprint; null when only a key id was returned. */
  fingerprint: z.string().nullable(),
  /** Long key id (16 hex), or the 8 hex short id a server returned alone. */
  keyId: z.string(),
  /** OpenPGP public-key algorithm number (RFC 4880 9.1 and successors). */
  algorithm: z.number().int().nullable(),
  algorithmName: z.string().nullable(),
  bits: z.number().int().nullable(),
  created: z.string().nullable(),
  expires: z.string().nullable(),
  /** Revoked on at least one server that returned the key. */
  revoked: z.boolean(),
  /** Past its expiry at query time, or flagged expired by a server that gave no date. */
  expired: z.boolean(),
  uids: z.array(pgpUidSchema),
  /** Hosts that returned the key, in server order. */
  servers: z.array(z.string()).min(1),
});

export const PGP_SERVER_STATUSES = [
  "ok",
  "empty",
  "error",
  "timeout",
  "skipped",
] as const;

export const pgpServerResultSchema = z.object({
  host: z.string(),
  status: z.enum(PGP_SERVER_STATUSES),
  /** Keys the server returned, before the domain filter and the merge. */
  keyCount: z.number().int().nonnegative(),
  /** `HTTP <status>`, a fixed failure class, or why the server was skipped; never response text. */
  detail: z.string().nullable(),
});

export const pgpLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  queryKind: pgpQueryKindSchema,
  queriedAt: z.string().min(1),
  servers: z.array(pgpServerResultSchema),
  keys: z.array(pgpKeySchema),
});

export type PgpUid = z.infer<typeof pgpUidSchema>;
export type PgpKeyHit = z.infer<typeof pgpKeySchema>;
export type PgpServerResult = z.infer<typeof pgpServerResultSchema>;
export type PgpServerStatus = PgpServerResult["status"];
export type PgpLookupSnapshot = z.infer<typeof pgpLookupSnapshotSchema>;
