import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { createCaseFieldsSchema } from "../case-create";
import { updateCaseFieldsSchema } from "../case-update";
import { dumpPasteFieldsSchema, dumpUrlFieldsSchema } from "../evidence-ingest";
import { confirmFileUploadInputSchema } from "../evidence-upload";

describe("createCaseFieldsSchema", () => {
  it("slugifies name when slug is omitted", () => {
    expect(createCaseFieldsSchema.parse({ name: "Alpha Case" })).toEqual({
      name: "Alpha Case",
      slug: "alpha-case",
      description: undefined,
    });
  });

  it("trims name and slugifies an explicit slug", () => {
    expect(
      createCaseFieldsSchema.parse({
        name: "  Alpha Case  ",
        slug: "  Alpha Corp  ",
      })
    ).toEqual({
      name: "Alpha Case",
      slug: "alpha-corp",
      description: undefined,
    });
  });
});

describe("updateCaseFieldsSchema", () => {
  it("trims name and clears blank description", () => {
    expect(
      updateCaseFieldsSchema.parse({
        name: "  Beta Case  ",
        description: "   ",
      })
    ).toEqual({
      name: "Beta Case",
      description: null,
    });
  });
});

describe("dumpPasteFieldsSchema", () => {
  it("trims body and optional metadata", () => {
    expect(
      dumpPasteFieldsSchema.parse({
        body: "  pasted text  ",
        label: "  note  ",
        sourceUrl: "  https://example.com/path  ",
      })
    ).toEqual({
      body: "pasted text",
      label: "note",
      sourceUrl: "https://example.com/path",
    });
  });
});

describe("dumpUrlFieldsSchema", () => {
  it("trims label and notes", () => {
    expect(
      dumpUrlFieldsSchema.parse({
        sourceUrl: "https://example.com",
        label: "  source  ",
        notes: "  context  ",
      })
    ).toEqual({
      sourceUrl: "https://example.com",
      label: "source",
      notes: "context",
    });
  });
});

describe("confirmFileUploadInputSchema", () => {
  const caseId = testId(1);
  const sha256 = "a".repeat(64);

  it("accepts base uri and named variant", () => {
    expect(
      confirmFileUploadInputSchema.parse({
        caseId,
        uri: `${caseId}/${sha256}`,
        sha256,
        mime: "text/plain",
        byteLength: 12,
      }).uri
    ).toBe(`${caseId}/${sha256}`);
    expect(
      confirmFileUploadInputSchema.parse({
        caseId,
        uri: `${caseId}/${sha256}/paste.txt`,
        sha256,
        mime: "text/plain",
        byteLength: 12,
      }).uri
    ).toBe(`${caseId}/${sha256}/paste.txt`);
  });

  it("rejects path traversal and mismatched uri prefix", () => {
    expect(
      confirmFileUploadInputSchema.safeParse({
        caseId,
        uri: `${caseId}/${sha256}/../other`,
        sha256,
        mime: "text/plain",
        byteLength: 12,
      }).success
    ).toBe(false);
    expect(
      confirmFileUploadInputSchema.safeParse({
        caseId,
        uri: `${testId(2)}/${sha256}`,
        sha256,
        mime: "text/plain",
        byteLength: 12,
      }).success
    ).toBe(false);
  });
});
