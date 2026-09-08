import { describe, it, expect } from "vitest";

import { interpretObservationClaim } from "../interpret-observation-claim.ts";
import { INVALID_COLLECT_ENTITY_SUMMARY } from "../resolve-collect-entity-id.ts";

describe("interpret-observation-claim", () => {
  const entityId = "11111111-1111-4111-8111-111111111111";

  it("interpretObservationClaim empty patch without entityId", () => {
    const result = interpretObservationClaim({
      entityId: undefined,
      text: "should not appear",
      noEntitySummary: "no Entity",
    });
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe("no Entity");
  });

  it("interpretObservationClaim empty patch for blank entityId", () => {
    const result = interpretObservationClaim({
      entityId: "",
      text: "should not appear",
      noEntitySummary: "no Entity",
    });
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe("no Entity");
  });

  it("interpretObservationClaim empty patch for whitespace entityId", () => {
    const result = interpretObservationClaim({
      entityId: "   ",
      text: "should not appear",
      noEntitySummary: "no Entity",
    });
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe("no Entity");
  });

  it("interpretObservationClaim rejects invalid entityId", () => {
    const result = interpretObservationClaim({
      entityId: "entity-1",
      text: "should not appear",
      noEntitySummary: "no Entity",
    });
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe(INVALID_COLLECT_ENTITY_SUMMARY);
  });

  it("interpretObservationClaim empty patch for blank claim text", () => {
    const result = interpretObservationClaim({
      entityId,
      text: "   ",
      noEntitySummary: "no Entity",
    });
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe("no Entity");
  });

  it("interpretObservationClaim trims padded claim text", () => {
    const text = "DNS for example.com: A=1.2.3.4";
    const result = interpretObservationClaim({
      entityId,
      text: `  ${text}  `,
      noEntitySummary: "no Entity",
    });
    expect(result.summary).toBe(text);
    expect(result.patch[0]?.data.text).toBe(text);
  });

  it("interpretObservationClaim trims padded entityId", () => {
    const text = "DNS for example.com: A=1.2.3.4";
    const result = interpretObservationClaim({
      entityId: `  ${entityId}  `,
      text,
      noEntitySummary: "no Entity",
    });
    expect(result.patch[0]?.data.entityId).toBe(entityId);
  });

  it("interpretObservationClaim creates observation claim when entityId set", () => {
    const text = "DNS for example.com: A=1.2.3.4";
    const result = interpretObservationClaim({
      entityId,
      text,
      noEntitySummary: "no Entity",
    });
    expect(result.summary).toBe(text);
    expect(result.patch.length).toBe(1);
    const op = result.patch[0];
    expect(op.op).toBe("create");
    expect(op.resource).toBe("claim");
    expect(typeof op.id).toBe("string");
    expect(op.data.entityId).toBe(entityId);
    expect(op.data.text).toBe(text);
    expect(op.data.class).toBe("observation");
  });
});
