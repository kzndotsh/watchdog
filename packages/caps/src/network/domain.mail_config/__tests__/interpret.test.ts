import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";
import type { MailConfigSnapshot } from "@watchdog/tools";

import { expectNoConfidenceOnPatch } from "../../../testing";
import { interpretMailConfigReport } from "../interpret.ts";

describe("interpretMailConfigReport", () => {
  const snap: MailConfigSnapshot = {
    host: "example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    mx: [{ exchange: "mail.example.com", priority: 10 }],
    spf: { present: true, records: ["v=spf1 -all"] },
    dmarc: { present: true, records: ["v=DMARC1; p=reject"] },
    dkim: {
      selectorsTried: ["default"],
      found: [
        {
          selector: "default",
          present: true,
          records: ["v=DKIM1; k=rsa; p=abc"],
        },
      ],
    },
    txt: ["v=spf1 -all"],
  };

  it("proposes a claim when entityId is set", () => {
    const result = interpretMailConfigReport(snap, {
      input: {
        host: "example.com",
        entityId: testId(1),
      },
    });
    expect(result.patch).toHaveLength(1);
    expect(String(result.summary)).toMatch(/Mail config/);
    expectNoConfidenceOnPatch(result);
  });

  it("emits an empty patch when entityId is omitted", () => {
    const result = interpretMailConfigReport(snap, {
      input: { host: "example.com" },
    });
    expect(result.patch).toHaveLength(0);
  });
});
