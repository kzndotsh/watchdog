import { describe, expect, it } from "vitest";

import type { ViewDnsReverseHostSnapshot } from "#tools/network";
import type { PatchOp } from "@watchdog/domain/schemas/graph";
import { testId } from "@watchdog/domain/test-kit";

import {
  dataOf,
  expectProposesClaim,
  itRejectsIncompleteReport,
} from "../../../testing";
import { viewDnsReverseMx } from "../cap.ts";
import { interpretViewDnsReverseMxReport } from "../interpret.ts";

describe("interpretViewDnsReverseMxReport", () => {
  const entityId = testId(1);
  const input = { host: "mail.example.net", entityId };

  const fixture: ViewDnsReverseHostSnapshot = {
    server: "mail.example.net",
    via: "mx",
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

  it("proposes the listed domains and states the shared-mail-server caveat", () => {
    const result = interpretViewDnsReverseMxReport(fixture, { input });

    expect(domainValues(result.patch)).toEqual([
      "alpha.example",
      "beta.example",
    ]);
    expect(
      expectProposesClaim(result, { textMatches: /^ViewDNS lists/ }).data.text
    ).toBe(
      "ViewDNS lists 2 domain(s) using mail server mail.example.net. Sharing a mail server does not show common ownership; large hosts serve millions of domains."
    );
  });

  it("names ViewDNS's own count and the page when the list is partial", () => {
    const result = interpretViewDnsReverseMxReport(
      { ...fixture, domainCount: 611_372, totalPages: 62 },
      { input }
    );

    expectProposesClaim(result, {
      textMatches: "(ViewDNS counts 611372) (page 1 of 62).",
    });
  });

  it("notes truncation past the batch limit", () => {
    const domains = Array.from({ length: 90 }, (_, i) => `h${i}.example`);
    const result = interpretViewDnsReverseMxReport(
      { ...fixture, domains, domainCount: 90 },
      { input }
    );

    expect(domainValues(result.patch)).toHaveLength(80);
    expectProposesClaim(result, { textMatches: /proposed 80 of 90/ });
  });

  itRejectsIncompleteReport(
    viewDnsReverseMx,
    { server: "mail.example.net" },
    { host: "mail.example.net" }
  );
});
