import { describe, expect, it } from "vitest";

import {
  deriveEgressClasses,
  egressDestinations,
  type CapContact,
} from "../cap-contact";

const anonymous: CapContact = {
  kind: "provider",
  host: "crt.sh",
  access: "anonymous",
};
const keyed: CapContact = {
  kind: "provider",
  host: "api.shodan.io",
  access: "keyed",
};

describe("deriveEgressClasses", () => {
  it("is local for a Cap with no contacts", () => {
    expect(deriveEgressClasses([])).toEqual(["local"]);
  });

  it("splits anonymous public sources from keyed vendors", () => {
    expect(deriveEgressClasses([anonymous])).toEqual(["public_lookup"]);
    expect(deriveEgressClasses([keyed])).toEqual(["account_lookup"]);
  });

  it("counts a fixed download and a fixed DNS zone as public lookups", () => {
    expect(
      deriveEgressClasses([
        {
          kind: "download",
          url: "https://check.torproject.org/exit-addresses",
        },
      ])
    ).toEqual(["public_lookup"]);
    expect(
      deriveEgressClasses([{ kind: "dns", zone: "origin.asn.cymru.com" }])
    ).toEqual(["public_lookup"]);
  });

  it("counts the input's own host over any transport as the target class", () => {
    for (const via of ["http", "tls", "dns"] as const) {
      expect(deriveEgressClasses([{ kind: "target", via }])).toEqual([
        "target",
      ]);
    }
  });

  it("returns every class once, in canonical order", () => {
    expect(
      deriveEgressClasses([
        { kind: "model" },
        keyed,
        anonymous,
        { kind: "target", via: "http" },
        anonymous,
      ])
    ).toEqual(["target", "public_lookup", "account_lookup", "model"]);
  });
});

describe("egressDestinations", () => {
  const contacts: CapContact[] = [
    { kind: "target", via: "http" },
    anonymous,
    keyed,
    { kind: "download", url: "https://check.torproject.org/exit-addresses" },
    { kind: "dns", zone: "origin.asn.cymru.com" },
    { kind: "model" },
  ];

  it("names the hosts and descriptions behind the blocked classes only", () => {
    expect(egressDestinations(contacts, ["public_lookup"])).toEqual([
      "crt.sh",
      "check.torproject.org",
      "DNS zone origin.asn.cymru.com",
    ]);
    expect(egressDestinations(contacts, ["account_lookup", "model"])).toEqual([
      "api.shodan.io",
      "the configured AI model endpoint",
    ]);
    expect(egressDestinations(contacts, ["target"])).toEqual([
      "the host you enter",
    ]);
  });

  it("lists each destination once", () => {
    expect(egressDestinations([anonymous, anonymous])).toEqual(["crt.sh"]);
  });
});
