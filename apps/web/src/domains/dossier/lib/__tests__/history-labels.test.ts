import { describe, expect, it } from "vitest";

import {
  historyChangedFieldsLine,
  historyFieldLabel,
} from "@/domains/dossier/lib/history-labels";

describe("historyFieldLabel", () => {
  it("turns a camelCase snapshot field into words", () => {
    expect(historyFieldLabel("evidenceIds")).toBe("evidence ids");
    expect(historyFieldLabel("resolvedNote")).toBe("resolved note");
    expect(historyFieldLabel("text")).toBe("text");
  });
});

describe("historyChangedFieldsLine", () => {
  it("lists the fields of an update", () => {
    expect(historyChangedFieldsLine("update", ["text", "confidence"])).toBe(
      "text, confidence"
    );
  });

  it("lists nothing for a create, a delete or an update that changed no field", () => {
    expect(historyChangedFieldsLine("create", ["text"])).toBeNull();
    expect(historyChangedFieldsLine("delete", ["text"])).toBeNull();
    expect(historyChangedFieldsLine("update", [])).toBeNull();
  });
});
