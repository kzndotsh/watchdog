import { describe, expect, it } from "vitest";

import {
  extractVcard,
  parseWhoisDate,
  readRdapDates,
  whoisStatusList,
} from "../shared";

describe("whois shared helpers", () => {
  it("whoisStatusList normalizes string and array status", () => {
    expect(whoisStatusList("ok")).toEqual(["ok"]);
    expect(whoisStatusList(["a", "b"])).toEqual(["a", "b"]);
  });

  it("extractVcard reads fn and org fields", () => {
    const vcard = ["vcard", [["fn", {}, "text", "Example Registrar"]]];
    expect(extractVcard(vcard, "fn")).toBe("Example Registrar");
  });

  it("readRdapDates extracts registration and expiration", () => {
    const dates = readRdapDates({
      events: [
        { eventAction: "registration", eventDate: "2000-01-01T00:00:00Z" },
        { eventAction: "expiration", eventDate: "2030-01-01T00:00:00Z" },
      ],
    });
    expect(parseWhoisDate(dates.registeredAt)).toBeTruthy();
    expect(parseWhoisDate(dates.expiresAt)).toBeTruthy();
  });

  it("readRdapDates keeps earliest registration and latest expiration", () => {
    const dates = readRdapDates({
      events: [
        { eventAction: "registration", eventDate: "2010-01-01T00:00:00Z" },
        { eventAction: "registration", eventDate: "2000-01-01T00:00:00Z" },
        { eventAction: "expiration", eventDate: "2025-01-01T00:00:00Z" },
        { eventAction: "expiration", eventDate: "2030-01-01T00:00:00Z" },
      ],
    });
    expect(dates.registeredAt).toBe("2000-01-01T00:00:00.000Z");
    expect(dates.expiresAt).toBe("2030-01-01T00:00:00.000Z");
  });
});
