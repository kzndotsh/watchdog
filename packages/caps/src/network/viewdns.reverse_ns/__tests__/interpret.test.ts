import { describe, expect, it } from "vitest";

import type { ViewDnsReverseHostSnapshot } from "#tools/network";
import type { PatchOp } from "@watchdog/domain/schemas/graph";
import { testId } from "@watchdog/domain/test-kit";

import {
  dataOf,
  expectProposesClaim,
  itRejectsIncompleteReport,
} from "../../../testing";
import { viewDnsReverseNs } from "../cap.ts";
import { interpretViewDnsReverseNsReport } from "../interpret.ts";

describe("interpretViewDnsReverseNsReport", () => {
  const entityId = testId(1);
  const input = { host: "ns1.example.net", entityId };

  const fixture: ViewDnsReverseHostSnapshot = {
    server: "ns1.example.net",
    via: "ns",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.viewdns.info",
    domainCount: 2,
    totalPages: 1,
    domains: ["alpha.example", "beta.example"],
  };

  function domainValues(patch: PatchOp[]): unknown[] {
    return patch.flatMap((op) =>
      op.kind === "identifier.create" ? [dataOf(op).value] : []
    );
  }

  it("proposes the listed domains and states the shared-nameserver caveat", () => {
    const result = interpretViewDnsReverseNsReport(fixture, { input });

    expect(domainValues(result.patch)).toEqual([
      "alpha.example",
      "beta.example",
    ]);
    expect(
      expectProposesClaim(result, { textMatches: /^ViewDNS lists/ }).data.text
    ).toBe(
      "ViewDNS lists 2 domain(s) using nameserver ns1.example.net. Sharing a nameserver does not show common ownership; large hosts serve millions of domains."
    );
  });

  it("does not propose the queried nameserver as a found domain", () => {
    const result = interpretViewDnsReverseNsReport(
      { ...fixture, domains: ["ns1.example.net", "alpha.example"] },
      { input }
    );

    expect(domainValues(result.patch)).toEqual(["alpha.example"]);
  });

  it("names ViewDNS's own count and the page when the list is partial", () => {
    const result = interpretViewDnsReverseNsReport(
      { ...fixture, domainCount: 9080, totalPages: 1 },
      { input }
    );
    const partial = interpretViewDnsReverseNsReport(
      { ...fixture, domainCount: 25_000, totalPages: 3 },
      { input }
    );

    expectProposesClaim(result, {
      textMatches:
        "2 domain(s) using nameserver ns1.example.net (ViewDNS counts 9080).",
    });
    expectProposesClaim(partial, {
      textMatches: "(ViewDNS counts 25000) (page 1 of 3).",
    });
  });

  it("notes truncation past the batch limit", () => {
    const domains = Array.from({ length: 90 }, (_, i) => `h${i}.example`);
    const result = interpretViewDnsReverseNsReport(
      { ...fixture, domains, domainCount: 90 },
      { input }
    );

    expect(domainValues(result.patch)).toHaveLength(80);
    expectProposesClaim(result, { textMatches: /proposed 80 of 90/ });
  });

  itRejectsIncompleteReport(
    viewDnsReverseNs,
    { server: "ns1.example.net" },
    { host: "ns1.example.net" }
  );
});
