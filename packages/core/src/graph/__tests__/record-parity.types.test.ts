import { describe, expect, expectTypeOf, it } from "vitest";
/**
 * Type test (#663): a Graph record's shape is owned by its `@watchdog/schemas/graph` schema.
 * Each core record type equals the schema's `z.output`, and each row mapper returns exactly it,
 * so a field added to a schema fails here (or in the mapper) until core fills it. `pnpm
 * typecheck` compiles this file; the runtime assertion only keeps vitest honest.
 */
import type { z } from "zod";

import type {
  caseEdgeSchema,
  caseIdentifierSchema,
  claimSchema,
  edgeSchema,
  entityListItemSchema,
  entitySchema,
  eventSchema,
  identifierSchema,
  questionSchema,
} from "@watchdog/schemas/graph";

import type {
  CaseEdgeRecord,
  CaseIdentifierRecord,
  ClaimRecord,
  EdgeRecord,
  EntityListConnection,
  EntityListItem,
  EntityRecord,
  EventRecord,
  IdentifierRecord,
  QuestionRecord,
} from "..";
import type { toCaseEdgeRecord } from "../edges";
import type { toCaseIdentifierRecord } from "../identifiers";
import type {
  toClaimRecord,
  toEntityRecord,
  toEventRecord,
  toIdentifierRecord,
  toQuestionRecord,
} from "../mutation/tables";

describe("graph records equal their schemas' output", () => {
  it("types each record", () => {
    expectTypeOf<EntityRecord>().toEqualTypeOf<z.output<typeof entitySchema>>();
    expectTypeOf<ClaimRecord>().toEqualTypeOf<z.output<typeof claimSchema>>();
    expectTypeOf<EventRecord>().toEqualTypeOf<z.output<typeof eventSchema>>();
    expectTypeOf<QuestionRecord>().toEqualTypeOf<
      z.output<typeof questionSchema>
    >();
    expectTypeOf<IdentifierRecord>().toEqualTypeOf<
      z.output<typeof identifierSchema>
    >();
    expectTypeOf<EdgeRecord>().toEqualTypeOf<z.output<typeof edgeSchema>>();
    expectTypeOf<CaseEdgeRecord>().toEqualTypeOf<
      z.output<typeof caseEdgeSchema>
    >();
    expectTypeOf<CaseIdentifierRecord>().toEqualTypeOf<
      z.output<typeof caseIdentifierSchema>
    >();
    expectTypeOf<EntityListItem>().toEqualTypeOf<
      z.output<typeof entityListItemSchema>
    >();
    expectTypeOf<EntityListConnection | null>().toEqualTypeOf<
      EntityListItem["soleConnection"]
    >();
    expect(true).toBe(true);
  });

  it("has each row mapper return its record", () => {
    expectTypeOf<ReturnType<typeof toEntityRecord>>().toEqualTypeOf<
      z.output<typeof entitySchema>
    >();
    expectTypeOf<ReturnType<typeof toClaimRecord>>().toEqualTypeOf<
      z.output<typeof claimSchema>
    >();
    expectTypeOf<ReturnType<typeof toEventRecord>>().toEqualTypeOf<
      z.output<typeof eventSchema>
    >();
    expectTypeOf<ReturnType<typeof toQuestionRecord>>().toEqualTypeOf<
      z.output<typeof questionSchema>
    >();
    expectTypeOf<ReturnType<typeof toIdentifierRecord>>().toEqualTypeOf<
      z.output<typeof identifierSchema>
    >();
    expectTypeOf<ReturnType<typeof toCaseEdgeRecord>>().toEqualTypeOf<
      z.output<typeof caseEdgeSchema>
    >();
    expectTypeOf<ReturnType<typeof toCaseIdentifierRecord>>().toEqualTypeOf<
      z.output<typeof caseIdentifierSchema>
    >();
    expect(true).toBe(true);
  });
});
