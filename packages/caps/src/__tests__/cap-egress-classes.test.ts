import { describe, expect, it } from "vitest";

import { deriveEgressClasses } from "@watchdog/schemas/caps";
import type { EgressClass } from "@watchdog/schemas/shared";

import { CAPABILITIES, listCapabilities } from "../registry";

const LOCAL: EgressClass[] = ["local"];
const TARGET: EgressClass[] = ["target"];
const PUBLIC: EgressClass[] = ["public_lookup"];
const ACCOUNT: EgressClass[] = ["account_lookup"];
const MODEL: EgressClass[] = ["model"];

/**
 * Every Cap's egress classes, pinned. They derive from `contacts` (`deriveEgressClasses`), so a
 * change here is a change in where a Case's seed can go: review it as one. A new Cap must be
 * added here, and the test fails until it is.
 */
const EXPECTED: Record<string, EgressClass[]> = {
  "archive.commoncrawl.lookup": PUBLIC,
  "archive.url.submit": PUBLIC,
  "archive.wayback.fetch": PUBLIC,
  "archive.wayback.lookup": PUBLIC,
  "breach.dehashed.lookup": ACCOUNT,
  "breach.hibp.lookup": ACCOUNT,
  "breach.hudsonrock.lookup": ACCOUNT,
  "breach.snusbase.lookup": ACCOUNT,
  "evidence.eml.analyze": LOCAL,
  "evidence.extract.ai": MODEL,
  "evidence.file.analyze": LOCAL,
  "evidence.harvest": LOCAL,
  "identity.email.lookup": TARGET,
  "identity.emailrep.lookup": ACCOUNT,
  "identity.github.lookup": ACCOUNT,
  "identity.gravatar.lookup": PUBLIC,
  "identity.keybase.lookup": PUBLIC,
  "identity.pgp.lookup": PUBLIC,
  "network.c99.lookup": ACCOUNT,
  "network.censys.lookup": ACCOUNT,
  "network.certspotter.lookup": PUBLIC,
  "network.ct.lookup": PUBLIC,
  "network.dns.lookup": TARGET,
  "network.dns.reverse": TARGET,
  "network.domain.mail_config": TARGET,
  "network.domain.txt_inventory": TARGET,
  "network.hackertarget.lookup": PUBLIC,
  "network.host.http_probe": TARGET,
  "network.host.tls_audit": TARGET,
  "network.ip.lookup": PUBLIC,
  "network.ipctl.lookup": PUBLIC,
  "network.ipinfo.lookup": ACCOUNT,
  "network.leakix.lookup": ACCOUNT,
  "network.mnemonic.lookup": PUBLIC,
  "network.shodan.lookup": ACCOUNT,
  "network.tor_exit.lookup": PUBLIC,
  "network.tranco.lookup": PUBLIC,
  "network.url.enrich": ["target", "public_lookup"],
  "network.urlscan.lookup": PUBLIC,
  "network.urlscan.submit": ACCOUNT,
  "network.whois.lookup": PUBLIC,
  "network.whoisxml.lookup": ACCOUNT,
  "network.whoxy.lookup": ACCOUNT,
  "threat.abuseipdb.lookup": ACCOUNT,
  "threat.bgpranking.lookup": PUBLIC,
  "threat.cymru_mhr.lookup": PUBLIC,
  "threat.dshield.lookup": PUBLIC,
  "threat.feodo.lookup": PUBLIC,
  "threat.firehol.lookup": PUBLIC,
  "threat.greedybear.lookup": PUBLIC,
  "threat.greynoise.lookup": ACCOUNT,
  "threat.hashlookup.lookup": PUBLIC,
  "threat.honeydb.lookup": ACCOUNT,
  "threat.malwarebazaar.lookup": ACCOUNT,
  "threat.otx.lookup": ACCOUNT,
  "threat.safebrowsing.lookup": ACCOUNT,
  "threat.threatfox.lookup": ACCOUNT,
  "threat.urlhaus.lookup": ACCOUNT,
  "threat.virustotal.lookup": ACCOUNT,
  "threat.xforce.lookup": ACCOUNT,
  "web.media.oembed": PUBLIC,
  "web.page.enrich": TARGET,
  "web.url.unshorten": TARGET,
};

describe("Cap egress classes", () => {
  it("pins the derived classes of every registered Cap", () => {
    const derived = Object.fromEntries(
      CAPABILITIES.map((cap) => [cap.id, deriveEgressClasses(cap.contacts)])
    );
    expect(derived).toEqual(EXPECTED);
  });

  it("puts the same classes on the catalog descriptors", () => {
    const catalog = Object.fromEntries(
      listCapabilities().map((cap) => [cap.id, cap.egress])
    );
    expect(catalog).toEqual(EXPECTED);
  });

  it("flags third_party exactly when a class leaves the install and the subject", () => {
    for (const cap of listCapabilities()) {
      const leaves = cap.egress.some((c) =>
        ["public_lookup", "account_lookup", "model"].includes(c)
      );
      expect(cap.flags?.includes("third_party") ?? false, cap.id).toBe(leaves);
    }
  });
});

describe("Cap contacts", () => {
  it("has a keyed provider contact exactly when the Cap sends a key to a provider", () => {
    for (const cap of CAPABILITIES) {
      const keyed = cap.contacts.some(
        (c) => c.kind === "provider" && c.access === "keyed"
      );
      const hasCredentials = (cap.credentials?.length ?? 0) > 0;
      if (keyed) {
        expect(hasCredentials, `${cap.id} declares a keyed provider`).toBe(
          true
        );
      }
      const required = (cap.credentials ?? []).some(
        (spec) => "anyOf" in spec || spec.optional !== true
      );
      if (required) {
        const carriesKey =
          keyed || cap.contacts.some((c) => c.kind === "model");
        expect(
          carriesKey,
          `${cap.id} needs a key but no contact carries it`
        ).toBe(true);
      }
    }
  });

  it("lists a Cap's contacts once each", () => {
    for (const cap of CAPABILITIES) {
      const keys = cap.contacts.map((c) => JSON.stringify(c));
      expect(new Set(keys).size, cap.id).toBe(keys.length);
    }
  });

  it("declares provider hosts as bare lowercase host names", () => {
    for (const cap of CAPABILITIES) {
      for (const c of cap.contacts) {
        if (c.kind !== "provider") continue;
        expect(c.host, cap.id).toMatch(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/);
      }
    }
  });

  it("declares downloads as fixed https URLs without a query", () => {
    for (const cap of CAPABILITIES) {
      for (const c of cap.contacts) {
        if (c.kind !== "download") continue;
        const url = new URL(c.url);
        expect(url.protocol, cap.id).toBe("https:");
        expect(url.search, cap.id).toBe("");
      }
    }
  });
});
