import { describe, expect, it } from "vitest";

import { extractEmails, extractUrls } from "../eml-extract.ts";

const LEGACY_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const LEGACY_URL = /https?:\/\/[^\s<>"')]+/gi;

const SAMPLES = [
  "Ada <ada@mailhost.test>, bob.smith+tag@sub.example.co.uk; carol@x.io",
  "mixed Case@Example.COM and a@b.c and a@b.cc and x@y.z.zz",
  "a@b.com.x-y@c.org tail@@double.com @lead.com trail@",
  "see https://a.test/x?y=1&z=2) and (http://b.test/p) <https://c.test/q> 'https://d.test'",
  "http:// https:// https://e.test http://f.test/ok.\nhttps://g.test/line",
  "weird..local@dom..ain.com user_name%x@host-name.org.",
];

function collect(
  fn: (text: string, into: Set<string>) => void,
  text: string
): string[] {
  const into = new Set<string>();
  fn(text, into);
  return [...into];
}

describe("linear IOC extraction matches the previous patterns on normal text", () => {
  it.each(SAMPLES)("emails: %s", (text) => {
    const legacy = [
      ...new Set((text.match(LEGACY_EMAIL) ?? []).map((e) => e.toLowerCase())),
    ];
    expect(collect(extractEmails, text)).toEqual(legacy);
  });

  it.each(SAMPLES)("urls: %s", (text) => {
    expect(collect(extractUrls, text)).toEqual([
      ...new Set(text.match(LEGACY_URL)),
    ]);
  });

  it("stops at the limit", () => {
    const text = Array.from({ length: 80 }, (_, i) => `u${i}@h.test`).join(" ");
    expect(collect(extractEmails, text)).toHaveLength(50);
  });
});
