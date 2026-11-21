import { z } from "zod";

import { validationVendorError } from "../errors/vendor-errors";
import { defineJsonProvider } from "../http/define-json-provider";
import { asString, recordRows } from "../parse/coerce";

export const HASHLOOKUP_ALGOS = ["md5", "sha1", "sha256", "sha512"] as const;
export type HashlookupAlgo = (typeof HASHLOOKUP_ALGOS)[number];

export const hashlookupSnapshotSchema = z.object({
  hash: z.string().min(1),
  algo: z.enum(HASHLOOKUP_ALGOS),
  queriedAt: z.string().min(1),
  source: z.literal("hashlookup.circl.lu"),
  found: z.boolean(),
  trust: z.union([z.number(), z.string()]).nullable(),
  fileName: z.string().nullable(),
  product: z.string().nullable(),
  md5: z.string().nullable(),
  sha1: z.string().nullable(),
  sha256: z.string().nullable(),
  parentCount: z.number().int().nullable(),
  childCount: z.number().int().nullable(),
});

export type HashlookupSnapshot = z.infer<typeof hashlookupSnapshotSchema>;

/** Normalize + validate a hex hash string, throws on unsupported length. */
export function normalizeHashlookupHash(raw: string): string {
  const hash = raw.trim().toLowerCase();
  if (!/^[a-f0-9]+$/.test(hash)) {
    throw validationVendorError(`Invalid hex hash: ${raw}`);
  }
  return hash;
}

function algoForHash(hash: string): HashlookupAlgo {
  switch (hash.length) {
    case 32: {
      return "md5";
    }
    case 40: {
      return "sha1";
    }
    case 64: {
      return "sha256";
    }
    case 128: {
      return "sha512";
    }
    default: {
      throw validationVendorError(
        `Unsupported hash length ${hash.length} for CIRCL hashlookup (expected MD5/SHA1/SHA256/SHA512)`
      );
    }
  }
}

function firstProductName(body: Record<string, unknown>): string | null {
  const products = recordRows(body.products);
  const first = products[0];
  if (!first) return null;
  return asString(first.ProductName);
}

/**
 * CIRCL hashlookup — known-file corpus (NSRL-derived), not a malware verdict.
 * GET https://hashlookup.circl.lu/lookup/{md5|sha1|sha256|sha512}/{hash}
 * @see https://hashlookup.circl.lu/
 */

type HashlookupOptions = {
  userAgent: string;
};

function missSnapshot(hash: string, algo: HashlookupAlgo, queriedAt: string) {
  return {
    hash,
    algo,
    queriedAt,
    source: "hashlookup.circl.lu" as const,
    found: false,
    trust: null,
    fileName: null,
    product: null,
    md5: null,
    sha1: null,
    sha256: null,
    parentCount: null,
    childCount: null,
  };
}

export const fetchHashlookupEffect = defineJsonProvider({
  service: "CIRCL hashlookup",
  schema: hashlookupSnapshotSchema,
  normalize: (raw) => {
    const value = normalizeHashlookupHash(raw);
    return { value, algo: algoForHash(value) };
  },
  request: ({ value, algo }, _options: HashlookupOptions) => ({
    url: `https://hashlookup.circl.lu/lookup/${algo}/${value}`,
  }),
  notFound: ({ subject, queriedAt }) =>
    missSnapshot(subject.value, subject.algo, queriedAt),
  toSnapshot: ({ subject, queriedAt, body }) => {
    const { value: hash, algo } = subject;
    const trustRaw = body["hashlookup:trust"];
    const trust =
      typeof trustRaw === "number" || typeof trustRaw === "string"
        ? trustRaw
        : null;
    const fileName = asString(body.FileName);
    const product = firstProductName(body);
    const md5 = asString(body.MD5);
    const sha1 = asString(body["SHA-1"]);
    const sha256 = asString(body["SHA-256"]);
    const parentCount = Array.isArray(body.parents)
      ? body.parents.length
      : null;
    const childCount = Array.isArray(body.children)
      ? body.children.length
      : null;
    const hasHit =
      trust !== null ||
      fileName !== null ||
      product !== null ||
      md5 !== null ||
      sha1 !== null ||
      sha256 !== null ||
      (parentCount ?? 0) > 0 ||
      (childCount ?? 0) > 0;
    if (!hasHit) return missSnapshot(hash, algo, queriedAt);

    return {
      hash,
      algo,
      queriedAt,
      source: "hashlookup.circl.lu" as const,
      found: true,
      trust,
      fileName,
      product,
      md5,
      sha1,
      sha256,
      parentCount,
      childCount,
    };
  },
});
