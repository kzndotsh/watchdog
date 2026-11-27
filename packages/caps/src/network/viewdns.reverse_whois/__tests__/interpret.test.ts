import { describe, expect, it } from "vitest";

import type { ViewDnsReverseWhoisSnapshot } from "#tools/network";
import type { PatchOp } from "@watchdog/domain/schemas/graph";
import { testId } from "@watchdog/domain/test-kit";

import {
  dataOf,
  expectProposesClaim,
  itRejectsIncompleteReport,
} from "../../../testing";
import { viewDnsReverseWhois } from "../cap.ts";
import { viewDnsReverseWhoisInput } from "../input.ts";
import { interpretViewDnsReverseWhoisReport } from "../interpret.ts";

describe("interpretViewDnsReverseWhoisReport", () => {
  const entityId = testId(1);
  const input = { query: "ada@example.com", entityId };

  const fixture: ViewDnsReverseWhoisSnapshot = {
    query: "ada@example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "api.viewdns.info",
    resultCount: 3,
    totalPages: 1,
    matches: [
      {
        domain: "alpha.example",
        createdDate: "2020-01-02",
        registrar: "Reg A",
      },
      { domain: "beta.example", createdDate: null, registrar: "Reg B" },
      { domain: "gamma.example", createdDate: null, registrar: "Reg A" },
    ],
  };

  function proposedIdentifiers(patch: PatchOp[]): unknown[] {
    return patch.flatMap((op) =>
      op.kind === "identifier.create"
        ? [[dataOf(op).type, dataOf(op).value]]
        : []
    );
  }

  it("proposes the matched domains, names registrars and states the collision caveat", () => {
    const result = interpretViewDnsReverseWhoisReport(fixture, { input });

    expect(proposedIdentifiers(result.patch)).toEqual([
      ["domain", "alpha.example"],
      ["domain", "beta.example"],
      ["domain", "gamma.example"],
    ]);
    expect(
      expectProposesClaim(result, { textMatches: /^ViewDNS lists/ }).data.text
    ).toBe(
      'ViewDNS lists 3 domain(s) whose registration record mentions "ada@example.com". Registrars include Reg A (2), Reg B (1). A WHOIS match does not prove the same registrant: privacy services and common names collide.'
    );
  });

  it("omits the registrar sentence when no match names one", () => {
    const result = interpretViewDnsReverseWhoisReport(
      {
        ...fixture,
        matches: [
          { domain: "alpha.example", createdDate: null, registrar: null },
        ],
        resultCount: 1,
      },
      { input }
    );

    const { text } = expectProposesClaim(result, {
      textMatches: /^ViewDNS lists/,
    }).data;
    expect(text).not.toContain("Registrars");
  });

  it("names ViewDNS's own count and the page when the list is partial", () => {
    const result = interpretViewDnsReverseWhoisReport(
      { ...fixture, resultCount: 4200, totalPages: 5 },
      { input }
    );

    expectProposesClaim(result, {
      textMatches: '"ada@example.com" (ViewDNS counts 4200) (page 1 of 5).',
    });
  });

  it("notes truncation past the batch limit", () => {
    const matches = Array.from({ length: 90 }, (_, i) => ({
      domain: `h${i}.example`,
      createdDate: null,
      registrar: null,
    }));
    const result = interpretViewDnsReverseWhoisReport(
      { ...fixture, matches, resultCount: 90 },
      { input }
    );

    expect(proposedIdentifiers(result.patch)).toHaveLength(80);
    expectProposesClaim(result, { textMatches: /proposed 80 of 90/ });
  });

  itRejectsIncompleteReport(
    viewDnsReverseWhois,
    { query: "ada@example.com" },
    { query: "ada@example.com" }
  );
});

describe("viewDnsReverseWhoisInput", () => {
  it("normalizes an email query like an email Identifier", () => {
    const parsed = viewDnsReverseWhoisInput.parse({
      query: " Ada@Example.COM ",
    });

    expect(parsed.query).toBe("ada@example.com");
  });

  it("rejects a query shorter than ViewDNS accepts", () => {
    const parsed = viewDnsReverseWhoisInput.safeParse({ query: "Ada" });

    expect(parsed.success).toBe(false);
  });
});
