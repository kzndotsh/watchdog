import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/domain/test-kit";
import type { EmailosintLookupSnapshot } from "@watchdog/tools/breach";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
} from "../../../testing";
import { emailosintLookup } from "../cap.ts";
import { interpretEmailosintLookupReport } from "../interpret.ts";

const EMAIL = "alex.morgan@mailhost.test";
const entityId = testId(1);

const report: EmailosintLookupSnapshot = {
  email: EMAIL,
  queriedAt: "2026-01-01T00:00:00.000Z",
  source: "api.emailosint.org",
  lookupId: "65fa0b1c2c4a8e0d1c8b2a3f",
  completed: true,
  timedOut: false,
  cloaked: false,
  resultsRedacted: false,
  accounts: [
    {
      service: "github",
      serviceName: "GitHub",
      domain: "github.com",
      category: "Developer",
      username: "alex",
      displayName: "Alex Morgan",
      profileUrl: "https://github.com/alex",
    },
  ],
  registeredOn: ["GitHub", "Adobe"],
  notRegisteredCount: 2,
  breachTotal: 6,
  breachSourceCount: 3,
  breachSources: [
    { name: "Adobe", date: "2013-10-04" },
    { name: "Canva", date: null },
  ],
  stealerLogCount: 2,
  stealerOriginHosts: ["login.shop.test"],
  isTruncated: false,
};

const interpret = (r: EmailosintLookupSnapshot) =>
  interpretEmailosintLookupReport(r, { input: { email: EMAIL, entityId } });

describe("interpret", () => {
  it("proposes the seed email and a Claim with services and exposure", () => {
    const result = interpret(report);
    expectProposesIdentifier(result, { type: "email", value: EMAIL });
    const text = claimText(result, 1);
    expect(text).toMatch(/registered on GitHub, Adobe/);
    expect(text).toMatch(/6 breach record\(s\) from 3 source\(s\)/);
    expect(text).toMatch(/Adobe \(2013-10-04\), Canva \(\+1 more\)/);
    expect(text).toMatch(/2 infostealer log\(s\)/);
    expect(text).not.toMatch(/partial/);
  });

  it("says when nothing was found", () => {
    const result = interpret({
      ...report,
      accounts: [],
      registeredOn: [],
      breachTotal: 0,
      breachSourceCount: 0,
      breachSources: [],
      stealerLogCount: 0,
      stealerOriginHosts: [],
    });
    expectProposesIdentifier(result, { type: "email", value: EMAIL });
    expect(claimText(result, 1)).toMatch(/no accounts or exposure reported/);
  });

  it("falls back to the service slug and the listed sources when counts are missing", () => {
    const text = claimText(
      interpret({
        ...report,
        accounts: [
          { ...report.accounts[0]!, serviceName: null, service: "gitlab" },
        ],
        registeredOn: [],
        breachSourceCount: null,
        breachSources: [{ name: "Canva", date: null }],
      }),
      1
    );
    expect(text).toMatch(/registered on gitlab/);
    expect(text).toMatch(
      /6 breach record\(s\) from 1 source\(s\): Canva$|from 1 source\(s\): Canva;/
    );
  });

  it("states a breach total without source names", () => {
    const text = claimText(
      interpret({ ...report, breachSources: [], breachSourceCount: 2 }),
      1
    );
    expect(text).toMatch(/6 breach record\(s\) from 2 source\(s\);/);
  });

  it("says when the vendor redacted results", () => {
    expect(
      claimText(interpret({ ...report, resultsRedacted: true }), 1)
    ).toMatch(/results redacted by the vendor/);
  });

  it("flags a partial or truncated result", () => {
    const text = claimText(
      interpret({ ...report, timedOut: true, isTruncated: true }),
      1
    );
    expect(text).toMatch(/partial result/);
    expect(text).toMatch(/lists truncated/);
  });

  itRejectsIncompleteReport(
    emailosintLookup,
    { email: EMAIL },
    { email: EMAIL }
  );
});
