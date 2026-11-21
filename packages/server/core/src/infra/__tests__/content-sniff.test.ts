import { describe, expect, it } from "vitest";

import { contradictsContent, normalizeMime, sniffMime } from "../content-sniff";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const PDF = new TextEncoder().encode("%PDF-1.7\n...");
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const TEXT = new TextEncoder().encode("plain words, no signature");

describe("sniffMime", () => {
  it("names the format of a known signature", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(PDF)).toBe("application/pdf");
    expect(sniffMime(ZIP)).toBe("application/zip");
  });

  it("returns null when no signature matches", () => {
    expect(sniffMime(TEXT)).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
});

describe("contradictsContent", () => {
  it("accepts a declared type that fits the bytes", () => {
    expect(contradictsContent("image/png", PNG)).toBe(false);
    expect(contradictsContent("Application/PDF; x=1", PDF)).toBe(false);
    expect(
      contradictsContent(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ZIP
      )
    ).toBe(false);
  });

  it("refuses a declared type the bytes contradict", () => {
    expect(contradictsContent("application/pdf", PNG)).toBe(true);
    expect(contradictsContent("text/plain", PNG)).toBe(true);
    expect(contradictsContent("image/png", ZIP)).toBe(true);
  });

  it("never judges a type that declares nothing, or bytes with no signature", () => {
    expect(contradictsContent("application/octet-stream", PNG)).toBe(false);
    expect(contradictsContent("", PNG)).toBe(false);
    expect(contradictsContent("image/png", TEXT)).toBe(false);
  });
});

describe("normalizeMime", () => {
  it("lowercases, drops parameters and folds the jpeg aliases", () => {
    expect(normalizeMime(" Text/Plain; charset=utf-8 ")).toBe("text/plain");
    expect(normalizeMime("image/jpg")).toBe("image/jpeg");
  });
});
