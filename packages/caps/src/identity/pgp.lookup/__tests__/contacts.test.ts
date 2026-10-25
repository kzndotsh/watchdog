import { describe, expect, it } from "vitest";

import { deriveEgressClasses } from "@watchdog/schemas/caps";
import { PGP_KEYSERVERS } from "@watchdog/tools/identity";

import { pgpKeyserverProviders } from "../../../providers";
import { HOST_REDISTRIBUTION } from "../../../redistribution";
import { pgpLookup } from "../cap.ts";

const HOSTS = [
  "keyserver.ubuntu.com",
  "keys.openpgp.org",
  "pgp.mit.edu",
  "keys.mailvelope.com",
  "pgpkeys.eu",
];

describe("identity.pgp.lookup contacts", () => {
  it("declares each keyserver as an anonymous provider contact", () => {
    expect(PGP_KEYSERVERS.map((server) => server.host)).toEqual(HOSTS);
    expect(pgpLookup.contacts.map((c) => c.kind)).toEqual(
      HOSTS.map(() => "provider")
    );
    expect(
      pgpLookup.contacts.map((c) => (c.kind === "provider" ? c.host : null))
    ).toEqual(HOSTS);
    expect(deriveEgressClasses(pgpLookup.contacts)).toEqual(["public_lookup"]);
  });

  it("has a provider entry and an unreviewed redistribution verdict per host", () => {
    for (const host of HOSTS) {
      expect(pgpKeyserverProviders[host]?.commercialUse).toBe("unknown");
      expect(HOST_REDISTRIBUTION[host]).toBe("unknown");
    }
  });

  it("reads email, domain and pgp Identifiers", () => {
    expect(pgpLookup.consumes).toEqual([
      { kind: "identifier", type: "email" },
      { kind: "identifier", type: "domain" },
      { kind: "identifier", type: "pgp" },
    ]);
  });
});
