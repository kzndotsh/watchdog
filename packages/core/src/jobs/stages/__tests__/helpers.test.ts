import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  jobEvidenceIdsForReuse,
  linkedEvidenceId,
  linkedEvidenceIdStrict,
  inputGraphUuid,
  inputGraphUuidStrict,
  inputString,
  parseStoredJobEvidenceIds,
} from "../helpers";

describe("job stage helpers", () => {
  it("inputString trims and drops blank strings", () => {
    expect(inputString({ entityId: "  ent-1  " }, "entityId")).toBe("ent-1");
    expect(inputString({ entityId: "   " }, "entityId")).toBeUndefined();
  });

  it("linkedEvidenceId trims whitespace from linked evidence ids", () => {
    const id = testId(1);
    expect(linkedEvidenceId({ evidenceId: `  ${id}  ` }, ["evidenceId"])).toBe(
      id
    );
  });

  it("treats blank strings as missing", () => {
    expect(linkedEvidenceId({ evidenceId: "   " }, ["evidenceId"])).toBe(
      undefined
    );
  });

  it("rejects non-uuid evidence ids", () => {
    expect(
      linkedEvidenceId({ evidenceId: "host-footprint" }, ["evidenceId"])
    ).toBeUndefined();
  });

  it("linkedEvidenceIdStrict distinguishes absent from invalid", () => {
    const id = testId(4);
    expect(
      linkedEvidenceIdStrict({ evidenceId: `  ${id}  ` }, ["evidenceId"])
    ).toBe(id);
    expect(linkedEvidenceIdStrict({}, ["evidenceId"])).toBeUndefined();
    expect(
      linkedEvidenceIdStrict({ evidenceId: "bad-id" }, ["evidenceId"])
    ).toBeNull();
    expect(
      linkedEvidenceIdStrict({ sourceEvidenceId: "bad-id" }, [
        "evidenceId",
        "sourceEvidenceId",
      ])
    ).toBeNull();
  });

  it("inputGraphUuid trims and validates entity ids", () => {
    const id = testId(2);
    expect(inputGraphUuid({ entityId: `  ${id}  ` }, "entityId")).toBe(id);
    expect(inputGraphUuid({ entityId: "host-footprint" }, "entityId")).toBe(
      undefined
    );
  });

  it("inputGraphUuidStrict distinguishes absent from invalid", () => {
    const id = testId(3);
    expect(inputGraphUuidStrict({}, "entityId")).toBeUndefined();
    expect(
      inputGraphUuidStrict({ entityId: "   " }, "entityId")
    ).toBeUndefined();
    expect(inputGraphUuidStrict({ entityId: `  ${id}  ` }, "entityId")).toBe(
      id
    );
    expect(
      inputGraphUuidStrict({ entityId: "host-footprint" }, "entityId")
    ).toBe(null);
  });

  it("parseStoredJobEvidenceIds rejects invalid stored job evidence ids", () => {
    const id = testId(5);
    expect(parseStoredJobEvidenceIds([`  ${id}  `])).toEqual({
      ok: true,
      ids: [id],
    });
    expect(parseStoredJobEvidenceIds([])).toEqual({ ok: true, ids: [] });
    expect(parseStoredJobEvidenceIds(["not-a-uuid"])).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(jobEvidenceIdsForReuse(["not-a-uuid"])).toEqual([]);
  });
});
