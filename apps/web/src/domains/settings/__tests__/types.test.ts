import { describe, expect, it } from "vitest";

import {
  deleteCredentialInputSchema,
  putCredentialInputSchema,
} from "@/domains/settings/types";

describe("settings credential schemas", () => {
  it("parses put credential input", () => {
    const parsed = putCredentialInputSchema.parse({
      name: "WHOIS_API_KEY",
      secret: "abc123",
      label: "  Primary  ",
    });
    expect(parsed.name).toBe("WHOIS_API_KEY");
    expect(parsed.secret).toBe("abc123");
    expect(parsed.label).toBe("Primary");
  });

  it("trims padded credential names", () => {
    expect(
      putCredentialInputSchema.parse({
        name: "  WHOIS_API_KEY  ",
        secret: "abc123",
      }).name
    ).toBe("WHOIS_API_KEY");
  });

  it("parses delete credential input", () => {
    const parsed = deleteCredentialInputSchema.parse({ name: "WHOIS_API_KEY" });
    expect(parsed.name).toBe("WHOIS_API_KEY");
  });

  it("rejects invalid credential names", () => {
    expect(
      putCredentialInputSchema.safeParse({
        name: "shodan",
        secret: "abc123",
      }).success
    ).toBe(false);
    expect(deleteCredentialInputSchema.safeParse({ name: "   " }).success).toBe(
      false
    );
  });
});
