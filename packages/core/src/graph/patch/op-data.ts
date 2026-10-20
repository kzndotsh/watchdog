import { Effect } from "effect";
import { z } from "zod";

import {
  type JsonObject,
  CLAIM_CLASSES,
  EDGE_PREDICATES,
  ENTITY_KINDS,
  IDENTIFIER_STATUSES,
  entitySlugSchema,
  trimmedOrNull,
  trimmedOrUndefined,
  trimmedUuidSchema,
} from "@watchdog/schemas/shared";

import { InvalidError, type DomainTag } from "../../infra/tagged-errors";

/**
 * The Zod schemas of a patch op's `data`, decoded at the op seam (ADR-0001) before the op
 * writes through the Graph mutation module. `assertPatchGates` has already refused an op
 * of the wrong shape, so a failure here is a gate and a schema that disagree; it is still
 * `Invalid` with the gate's wording, never a defect.
 */

const required = (key: string) => `${key} is required`;

/** A non-blank string, trimmed: `<key> is required` otherwise. */
const text = (key: string) =>
  z
    .string({ error: required(key) })
    .trim()
    .min(1, { error: required(key) });

/** Run `schema` over an already-checked string; `message` is the issue when it refuses. */
function through(schema: z.ZodType<string>, message: string) {
  return (value: string, ctx: z.RefinementCtx): string => {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    ctx.addIssue({ code: "custom", message });
    return z.NEVER;
  };
}

/** A UUID of the Graph, trimmed. */
const uuid = (key: string) =>
  text(key).transform(
    through(trimmedUuidSchema, `${key} must be a valid UUID`)
  );

/** One of `allowed`, case-insensitive: `Invalid <label>: <value>` otherwise. */
function member<T extends string>(
  key: string,
  label: string,
  allowed: readonly T[]
) {
  return text(key).transform((value, ctx): T => {
    const found = allowed.find((each) => each === value.toLowerCase());
    if (found === undefined) {
      ctx.addIssue({ code: "custom", message: `Invalid ${label}: ${value}` });
      return z.NEVER;
    }
    return found;
  });
}

/** Not a string (absent, null, a number): the field was not given. */
const givenText = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** A string field that may be missing or of another type: the value, or `undefined`. */
const lenient = <S extends z.ZodType>(schema: S) =>
  z.preprocess(givenText, schema.optional());

/** Optional text: trimmed, blank or not a string reads as `null`. */
const nullableText = z
  .unknown()
  .optional()
  .transform((value) => trimmedOrNull(givenText(value)));

const entityId = uuid("entityId");

export const claimOpData = z.object({
  entityId,
  text: text("text"),
  class: lenient(member("class", "claim class", CLAIM_CLASSES)).transform(
    (value) => value ?? ("observation" as const)
  ),
});

export const eventOpData = z
  .object({
    entityId,
    when: text("when"),
    what: text("what"),
    where: nullableText,
  })
  .transform(({ where, ...rest }) => ({ ...rest, whereText: where }));

export const questionOpData = z.object({ entityId, text: text("text") });

export const entityWriteOpData = z.object({
  kind: member("kind", "entity kind", ENTITY_KINDS),
  name: text("name"),
  slug: text("slug").transform(
    through(entitySlugSchema, "entity slug is required")
  ),
  summary: nullableText,
  notes: nullableText,
});

export const identifierOpData = z.object({
  entityId,
  type: text("type"),
  value: text("value"),
  platform: z
    .unknown()
    .optional()
    .transform((value) => givenText(value) ?? ""),
  status: lenient(
    member("status", "identifier status", IDENTIFIER_STATUSES)
  ).transform((value) => value ?? ("unknown" as const)),
  notes: nullableText,
});

export const edgeOpData = z.object({
  fromId: uuid("fromId"),
  toId: uuid("toId"),
  predicate: member("predicate", "edge predicate", EDGE_PREDICATES),
  notes: nullableText,
});

/** What an entity `update` op sets: only the fields it carries. */
export const entityUpdateOpData = z
  .object({
    summary: z.unknown().optional(),
    notes: z.unknown().optional(),
    name: z.unknown().optional(),
  })
  .transform((data) => {
    const patch: {
      summary?: string | null;
      notes?: string | null;
      name?: string;
    } = {};
    if ("summary" in data)
      patch.summary = trimmedOrNull(givenText(data.summary));
    if ("notes" in data) patch.notes = trimmedOrNull(givenText(data.notes));
    const name = trimmedOrUndefined(givenText(data.name));
    if (name !== undefined) patch.name = name;
    return patch;
  });

/** Decode `data` with `schema`; the first issue's message is the `Invalid` reason. */
export function decodeOpData<T>(
  schema: z.ZodType<T>,
  data: JsonObject
): Effect.Effect<T, DomainTag> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return Effect.succeed(parsed.data);
  return new InvalidError({
    reason: parsed.error.issues[0]?.message ?? "invalid",
  });
}
