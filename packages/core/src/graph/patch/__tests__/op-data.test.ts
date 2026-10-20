import { describe, expect, it } from "vitest";

import {
  claimOpData,
  edgeOpData,
  entityUpdateOpData,
  entityWriteOpData,
  eventOpData,
  identifierOpData,
} from "../op-data";

const ENTITY = "00000000-0000-4000-8000-000000000020";

function reason(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}): string | undefined {
  return result.error?.issues[0]?.message;
}

describe("patch op data (Zod at the op seam)", () => {
  it("trims, lowercases an enum and defaults a claim's class", () => {
    expect(
      claimOpData.parse({ entityId: ` ${ENTITY} `, text: "  seen  " })
    ).toEqual({ entityId: ENTITY, text: "seen", class: "observation" });
    expect(
      claimOpData.parse({ entityId: ENTITY, text: "x", class: " Assessment " })
        .class
    ).toBe("assessment");
  });

  it("refuses with the gate's wording", () => {
    expect(reason(claimOpData.safeParse({ text: "x" }))).toBe(
      "entityId is required"
    );
    expect(reason(claimOpData.safeParse({ entityId: "nope", text: "x" }))).toBe(
      "entityId must be a valid UUID"
    );
    expect(
      reason(claimOpData.safeParse({ entityId: ENTITY, text: "  " }))
    ).toBe("text is required");
    expect(
      reason(
        claimOpData.safeParse({ entityId: ENTITY, text: "x", class: "bogus" })
      )
    ).toBe("Invalid claim class: bogus");
    expect(
      reason(
        entityWriteOpData.safeParse({ kind: "person", name: "A", slug: "!!" })
      )
    ).toBe("entity slug is required");
  });

  it("reads optional text as null when blank or not a string", () => {
    expect(
      eventOpData.parse({
        entityId: ENTITY,
        when: "1840",
        what: "Born",
        where: 3,
      }).whereText
    ).toBeNull();
    expect(
      identifierOpData.parse({
        entityId: ENTITY,
        type: "email",
        value: "a@b.test",
        notes: "  ",
      })
    ).toMatchObject({ platform: "", status: "unknown", notes: null });
    expect(
      edgeOpData.parse({
        fromId: ENTITY,
        toId: "00000000-0000-4000-8000-000000000021",
        predicate: "Owns",
        notes: " why ",
      })
    ).toMatchObject({ predicate: "owns", notes: "why" });
  });

  it("an entity update sets only the fields it carries", () => {
    expect(entityUpdateOpData.parse({})).toEqual({});
    expect(
      entityUpdateOpData.parse({ summary: " s ", notes: null, name: "  " })
    ).toEqual({ summary: "s", notes: null });
    expect(entityUpdateOpData.parse({ name: " N " })).toEqual({ name: "N" });
  });
});
