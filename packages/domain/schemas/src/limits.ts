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
 * limit (`REQUEST_BODY_MAX_BYTES`, below), so one request cannot carry more
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
  /**
   * A pagination cursor (base64url of the list name, the row id and its sort key). The largest
   * key is an Identifier list's: an Entity name, a type and a value of up to `url` characters,
   * which JSON and base64 turn into a few times that; this leaves room for the worst case.
   */
  cursor: 24_576,
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
export const CURSOR_MAX = INPUT_LIMITS.cursor;

/**
 * Largest request body the server reads (bytes): anything larger is answered 413
 * (`payload_too_large`) before routing. It covers the biggest single field (`BODY_MAX`
 * characters, 4 bytes each in UTF-8) with room for the JSON around it. Evidence files are
 * not bound by it: they go to the object store with a presigned PUT, whose signature covers the
 * declared length (at most `MAX_UPLOAD_BYTES`), so the two limits never overlap: only the file's
 * metadata crosses the web app.
 */
export const REQUEST_BODY_MAX_BYTES = 2 * 1024 * 1024;
