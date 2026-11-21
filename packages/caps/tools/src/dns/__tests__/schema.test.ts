import { describe, expect, it } from "vitest";

import { dnsRecordsSchema } from "../schema";

describe("dnsRecordsSchema", () => {
  it("parses full DNS record sets", () => {
    const records = dnsRecordsSchema.parse({
      host: "example.com",
      a: ["93.184.216.34"],
      aaaa: [],
      mx: [{ exchange: "mx.example.com", priority: 10 }],
      txt: [["v=spf1 -all"]],
      ns: ["ns.example.com"],
    });
    expect(records.host).toBe("example.com");
    expect(records.mx[0]?.exchange).toBe("mx.example.com");
  });
});
