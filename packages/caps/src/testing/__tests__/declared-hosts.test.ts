import { describe, expect, it } from "vitest";

import type { CapContact } from "@watchdog/schemas/caps";
import type { ProviderCall } from "@watchdog/tools/http";

import { touchedHosts, undeclaredHosts } from "../declared-hosts";

function httpCall(...urls: string[]): ProviderCall {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    seq: 0,
    transport: "http",
    method: "GET",
    url: urls[0] ?? "",
    bodyKind: "response",
    requestBody: { state: "none" },
    hops: urls.map((url) => ({ url, status: 200, attempts: 1 })),
    outcome: "response",
    servedFrom: null,
    status: 200,
    responseHeaders: {},
    startedAt: "2026-01-01T00:00:00.000Z",
    headersMs: 1,
    durationMs: 1,
    body: { state: "none" },
    failure: null,
  };
}

function directCall(transport: "dns" | "tls", url: string): ProviderCall {
  return { ...httpCall(), transport, method: "X", url, hops: [] };
}

const shodan: CapContact = {
  kind: "provider",
  host: "api.shodan.io",
  access: "keyed",
};

describe("undeclaredHosts", () => {
  it("passes when every touched host is declared", () => {
    expect(
      undeclaredHosts([shodan], [httpCall("https://api.shodan.io/host/1")])
    ).toEqual([]);
  });

  it("names a host no contact declares", () => {
    expect(
      undeclaredHosts(
        [shodan],
        [
          httpCall("https://api.shodan.io/host/1"),
          httpCall("https://other.example/x"),
        ]
      )
    ).toEqual(["http other.example"]);
  });

  it("ignores case and a trailing dot when matching", () => {
    expect(
      undeclaredHosts([shodan], [httpCall("https://API.shodan.io./host/1")])
    ).toEqual([]);
  });

  it("admits a redirect hop only for a provider that declares any_public redirects", () => {
    const calls = [
      httpCall("https://rdap.org/domain/a", "https://registry.example/a"),
    ];
    const plain: CapContact = {
      kind: "provider",
      host: "rdap.org",
      access: "anonymous",
    };
    expect(undeclaredHosts([plain], calls)).toEqual(["http registry.example"]);
    expect(
      undeclaredHosts([{ ...plain, redirects: "any_public" }], calls)
    ).toEqual([]);
  });

  it("admits a download only at its own host", () => {
    const download: CapContact = {
      kind: "download",
      url: "https://check.torproject.org/exit-addresses",
    };
    expect(
      undeclaredHosts([download], [httpCall("https://check.torproject.org/x")])
    ).toEqual([]);
    expect(
      undeclaredHosts([download], [httpCall("https://evil.example/x")])
    ).toEqual(["http evil.example"]);
  });

  it("admits the input's host for an HTTP target, and any redirect hop", () => {
    const target: CapContact = { kind: "target", via: "http" };
    const run = { targetHost: "subject.test" };
    expect(
      undeclaredHosts(
        [target],
        [httpCall("https://subject.test/", "https://www.subject.test/")],
        run
      )
    ).toEqual([]);
    expect(
      undeclaredHosts([target], [httpCall("https://other.example/")], run)
    ).toEqual(["http other.example"]);
    expect(
      undeclaredHosts(
        [{ ...target, anyHost: true }],
        [httpCall("https://other.example/")],
        run
      )
    ).toEqual([]);
  });

  it("keeps a DNS or TLS target on the input's own name", () => {
    const dns: CapContact = { kind: "target", via: "dns" };
    const run = { targetHost: "subject.test" };
    expect(
      undeclaredHosts(
        [dns],
        [
          directCall("dns", "dns:subject.test?type=MX"),
          directCall("dns", "dns:_dmarc.subject.test?type=TXT"),
        ],
        run
      )
    ).toEqual([]);
    expect(
      undeclaredHosts(
        [dns],
        [directCall("dns", "dns:elsewhere.test?type=A")],
        run
      )
    ).toEqual(["dns elsewhere.test"]);
    const tls: CapContact = { kind: "target", via: "tls" };
    expect(
      undeclaredHosts(
        [tls],
        [directCall("tls", "tls://elsewhere.test:443")],
        run
      )
    ).toEqual(["tls elsewhere.test"]);
  });

  it("does not let a DNS target admit an HTTP request to the same host", () => {
    expect(
      undeclaredHosts(
        [{ kind: "target", via: "dns" }],
        [httpCall("https://subject.test/")],
        { targetHost: "subject.test" }
      )
    ).toEqual(["http subject.test"]);
  });

  it("admits names inside a declared DNS zone only", () => {
    const zone: CapContact = { kind: "dns", zone: "origin.asn.cymru.com" };
    expect(
      undeclaredHosts(
        [zone],
        [directCall("dns", "dns:4.3.2.1.origin.asn.cymru.com?type=TXT")]
      )
    ).toEqual([]);
    expect(
      undeclaredHosts(
        [zone],
        [directCall("dns", "dns:origin.asn.cymru.com.evil.test?type=TXT")]
      )
    ).toEqual(["dns origin.asn.cymru.com.evil.test"]);
  });

  it("admits the model endpoint's host for a model contact", () => {
    const model: CapContact = { kind: "model" };
    const calls = [httpCall("https://api.anthropic.com/v1/messages")];
    expect(
      undeclaredHosts([model], calls, { modelHost: "api.anthropic.com" })
    ).toEqual([]);
    expect(undeclaredHosts([model], calls)).toEqual(["http api.anthropic.com"]);
  });

  it("flags every host of a Cap that declares nothing", () => {
    expect(undeclaredHosts([], [httpCall("https://a.example/")])).toEqual([
      "http a.example",
    ]);
  });
});

describe("touchedHosts", () => {
  it("reads the name out of a DNS call and the peer out of a TLS call", () => {
    expect(
      touchedHosts(directCall("dns", "dns:Mail.Subject.test.?type=MX"))
    ).toEqual([{ transport: "dns", host: "mail.subject.test", hop: 0 }]);
    expect(touchedHosts(directCall("tls", "tls://subject.test:8443"))).toEqual([
      { transport: "tls", host: "subject.test", hop: 0 },
    ]);
  });
});
