import { describe, expect, it } from "vitest";

import { classifyBreachQuery } from "../classify-breach-query.ts";
import { classifyIpOrHost } from "../classify-ip-or-host.ts";
import { asBool, asNumber, asString, isRecord, recordRows } from "../coerce.ts";

describe("classifyBreachQuery", () => {
  it("classifies email, ip, and username", () => {
    expect(classifyBreachQuery("Ada@MailHost.test")).toEqual({
      kind: "email",
      value: "ada@mailhost.test",
    });
    expect(classifyBreachQuery("8.8.8.8").kind).toBe("ip");
  });

  it("falls back to username for invalid email shapes", () => {
    expect(classifyBreachQuery("foo@")).toEqual({
      kind: "username",
      value: "foo@",
    });
    expect(classifyBreachQuery("@bar")).toEqual({
      kind: "username",
      value: "@bar",
    });
  });
});

describe("classifyIpOrHost", () => {
  it("normalizes a domain", () => {
    expect(classifyIpOrHost("HTTPS://MailHost.test/path")).toEqual({
      kind: "domain",
      value: "mailhost.test",
    });
  });

  it("classifies bracketed IPv6 literals as IP", () => {
    expect(classifyIpOrHost("[::1]")).toEqual({ kind: "ip", value: "::1" });
    expect(classifyIpOrHost("[2001:db8::1]:443")).toEqual({
      kind: "ip",
      value: "2001:db8::1",
    });
  });

  it("rejects invalid hostnames", () => {
    expect(() => classifyIpOrHost("not a host!")).toThrow(/Invalid hostname/);
    expect(() => classifyIpOrHost("")).toThrow(/Invalid hostname/);
  });
});

describe("coerce", () => {
  it("narrows records and booleans", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([1])).toBe(false);
    expect(recordRows([{ a: 1 }, 2])).toEqual([{ a: 1 }]);
    expect(asString("  x  ")).toBe("x");
    expect(asBool("yes")).toBe(true);
    expect(asNumber("15169")).toBe(15_169);
    expect(asNumber(15_169)).toBe(15_169);
  });
});
