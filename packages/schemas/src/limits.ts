/**
 * Named maximums for every free-text field and array in an input schema: the one
 * source. An input schema picks the limit that names what the field holds; it never
 * invents a number. `watchdog/bounded-input-schema` fails a `z.string()` or
 * `z.array()` with no `.max()` / `.length()` in the input-schema files, and
 * `__tests__/input-limits.test.ts` proves each limit rejects max + 1 and accepts max.
 *
 * Lengths are UTF-16 code units, counted after trimming. Every limit sits above what
 * real data needs (a hostname is at most 253 characters, an email 254, a slug is cut at
 * 64, Evidence text is packed to 80 000 characters) and well under the request body
 * limit (`REQUEST_BODY_MAX_BYTES` in the web app), so one request cannot carry more
 * than a few of them.
 */
export const INPUT_LIMITS = {
  /** Names, labels, platforms, handles, hosts, emails, ids, cursors, MIME types. */
  name: 256,
  /** A Case or Entity slug (`slugifyName` cuts at the same length). */
  slug: 64,
  /** A Task title or any other one-line heading. */
  title: 500,
  /** Notes, descriptions, summaries, Claim text, reasons: prose a person writes. */
  notes: 20_000,
  /** A pasted Evidence body and any string inside a JSON payload. */
  body: 200_000,
  /** A URL, or an identifier value that may hold one. */
  url: 2048,
  /** A credential secret (API token, service-account JSON). */
  secret: 16_384,
  /** Items in one list input: ids, patch ops, JSON arrays. */
  array: 1000,
} as const;

export type InputLimitName = keyof typeof INPUT_LIMITS;

export const NAME_MAX = INPUT_LIMITS.name;
export const SLUG_MAX = INPUT_LIMITS.slug;
export const TITLE_MAX = INPUT_LIMITS.title;
export const NOTES_MAX = INPUT_LIMITS.notes;
export const BODY_MAX = INPUT_LIMITS.body;
export const URL_MAX = INPUT_LIMITS.url;
export const SECRET_MAX = INPUT_LIMITS.secret;
export const ARRAY_MAX = INPUT_LIMITS.array;
