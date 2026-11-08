import { Effect } from "effect";
import type { HttpClient } from "effect/http";
import type { z } from "zod";

import { isToolsTag, mapToolsCatch } from "../errors/map-tools-catch";
import type { ToolsTag } from "../errors/tagged-errors";
import { nowIsoStringEffect } from "../infra/clock";
import { isRecord } from "../parse/coerce";
import { fetchJsonObjectEffect } from "./fetch-json";

/**
 * Where a provider's key goes. `basic` takes the secret as `user:password`.
 * A blank key is not sent, so a provider whose key is optional (GreyNoise) passes `""`.
 */
export type KeyPlacement =
  | { readonly header: string }
  | { readonly query: string }
  | "bearer"
  | "basic";

/** What a provider asks of one lookup: everything but the key, the User-Agent and `Accept`. */
export type JsonRequest = {
  url: string | URL;
  /** Default GET. */
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
};

export type JsonProviderContext<S, O> = {
  subject: S;
  queriedAt: string;
  status: number;
  /** The JSON object body; `{}` for a not-found status whose body is not an object. */
  body: Record<string, unknown>;
  options: O;
};

export type JsonProviderSpec<
  S extends string | { value: string },
  Snap extends z.ZodType,
  O extends { userAgent: string },
> = {
  /** Vendor name in errors. */
  service: string;
  /** The snapshot, parsed from `toSnapshot` / `notFound` output. */
  schema: Snap;
  /** Raw subject to its normal form; a throw becomes a tools error. The subject is the string, or its `value`. */
  normalize: (raw: string) => S;
  request: (subject: S, options: O) => JsonRequest;
  /** Absent: the call is keyless. */
  key?: KeyPlacement;
  /**
   * Statuses that mean "the vendor has nothing on this subject", default `[404]`. They count as
   * accepted (with the 2xx statuses) only when `notFound` is declared.
   */
  notFoundStatuses?: readonly number[];
  /** The snapshot for a not-found status; `body` is what the vendor sent, if anything. */
  notFound?: (ctx: JsonProviderContext<S, O>) => z.input<Snap>;
  /** The snapshot for any other accepted status. May throw a tools error. */
  toSnapshot: (ctx: JsonProviderContext<S, O>) => z.input<Snap>;
};

type Call<Snap extends z.ZodType> = Effect.Effect<
  z.output<Snap>,
  ToolsTag,
  HttpClient.HttpClient
>;

function subjectLabel(subject: string | { value: string }): string {
  return typeof subject === "string" ? subject : subject.value;
}

function keyedRequest(
  request: JsonRequest,
  placement: KeyPlacement | undefined,
  key: string,
  userAgent: string
): { url: string | URL; init: RequestInit } {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...request.headers,
    "User-Agent": userAgent,
  };
  let { url } = request;
  if (placement !== undefined && key.trim() !== "") {
    if (placement === "bearer") {
      headers.Authorization = `Bearer ${key}`;
    } else if (placement === "basic") {
      headers.Authorization = `Basic ${Buffer.from(key).toString("base64")}`;
    } else if ("header" in placement) {
      headers[placement.header] = key;
    } else {
      const withKey = new URL(url);
      withKey.searchParams.set(placement.query, key);
      url = withKey;
    }
  }
  const init: RequestInit = { method: request.method ?? "GET", headers };
  if (request.body !== undefined) init.body = request.body;
  return { url, init };
}

function runJsonProvider<
  S extends string | { value: string },
  Snap extends z.ZodType,
  O extends { userAgent: string },
>(
  spec: JsonProviderSpec<S, Snap, O>,
  raw: string,
  key: string,
  signal: AbortSignal,
  options: O
): Call<Snap> {
  const notFoundStatuses =
    spec.notFound === undefined ? [] : (spec.notFoundStatuses ?? [404]);
  return Effect.gen(function* runJsonProviderGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const subject = yield* Effect.try({
      try: () => spec.normalize(raw),
      catch: mapToolsCatch,
    });
    const { url, init } = keyedRequest(
      spec.request(subject, options),
      spec.key,
      key,
      options.userAgent
    );
    const { status, body } = yield* fetchJsonObjectEffect({
      url,
      init,
      signal,
      service: spec.service,
      subject: subjectLabel(subject),
      acceptStatus: (code) =>
        (code >= 200 && code < 300) || notFoundStatuses.includes(code),
    });
    const ctx = { subject, queriedAt, status, body, options };
    const build =
      spec.notFound !== undefined && notFoundStatuses.includes(status)
        ? spec.notFound
        : spec.toSnapshot;
    const input = yield* Effect.try({
      try: () => build(ctx),
      catch: (error) => {
        if (isToolsTag(error)) return error;
        throw error;
      },
    });
    return spec.schema.parse(input);
  });
}

/**
 * One JSON-object provider: normalize the subject, build the request, place the key, fetch, map a
 * not-found status, and parse the snapshot. Fetching, limits and the 429 policy stay in
 * `fetchJsonObjectEffect`; a lookup that needs two calls or a multi-step flow stays hand-written.
 *
 * Returns `(raw, key, signal, options)` when `key` is declared, else `(raw, signal, options)`.
 */
export function defineJsonProvider<
  S extends string | { value: string },
  Snap extends z.ZodType,
  O extends { userAgent: string },
>(
  spec: JsonProviderSpec<S, Snap, O> & { key: KeyPlacement }
): (raw: string, key: string, signal: AbortSignal, options: O) => Call<Snap>;
export function defineJsonProvider<
  S extends string | { value: string },
  Snap extends z.ZodType,
  O extends { userAgent: string },
>(
  spec: JsonProviderSpec<S, Snap, O> & { key?: undefined }
): (raw: string, signal: AbortSignal, options: O) => Call<Snap>;
export function defineJsonProvider<
  S extends string | { value: string },
  Snap extends z.ZodType,
  O extends { userAgent: string },
>(spec: JsonProviderSpec<S, Snap, O>) {
  if (spec.key === undefined) {
    return (raw: string, signal: AbortSignal, options: O) =>
      runJsonProvider(spec, raw, "", signal, options);
  }
  return (raw: string, key: string, signal: AbortSignal, options: O) =>
    runJsonProvider(spec, raw, key, signal, options);
}

/** One snapshot field read from a body object: its own name unless `key` says otherwise. */
export type Field<T> = {
  readonly key?: string;
  readonly read: (v: unknown) => T;
};

const strictNumber = (v: unknown): number | null =>
  typeof v === "number" ? v : null;
const strictString = (v: unknown): string | null =>
  typeof v === "string" ? v : null;
const strictBoolean = (v: unknown): boolean | null =>
  typeof v === "boolean" ? v : null;

/** A string field (not trimmed); anything else is `null`. */
export const str = (key?: string): Field<string | null> =>
  key === undefined ? { read: strictString } : { key, read: strictString };
/** A number field; anything else is `null`. */
export const num = (key?: string): Field<number | null> =>
  key === undefined ? { read: strictNumber } : { key, read: strictNumber };
/** A boolean field; anything else is `null`. */
export const bool = (key?: string): Field<boolean | null> =>
  key === undefined ? { read: strictBoolean } : { key, read: strictBoolean };

/** `source[key]` as an object, or `{}`: for digging into nested bodies without a guard each level. */
export function child(source: unknown, key: string): Record<string, unknown> {
  if (!isRecord(source)) return {};
  const value = source[key];
  return isRecord(value) ? value : {};
}

/** Read the declared fields from `source`: `pick(data, { isp: str(), asOwner: str("as_owner") })`. */
export function pick<const F extends Record<string, Field<unknown>>>(
  source: Record<string, unknown>,
  fields: F
): { [K in keyof F]: ReturnType<F[K]["read"]> } {
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    out[name] = field.read(source[field.key ?? name]);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mapped type is the contract; each name holds its field's read
  return out as { [K in keyof F]: ReturnType<F[K]["read"]> };
}
