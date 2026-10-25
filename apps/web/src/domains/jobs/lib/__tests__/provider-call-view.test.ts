import { describe, expect, it } from "vitest";

import {
  bodySummary,
  callOutcomeLabel,
  formatByteSize,
  formatCallDuration,
  isCallFailure,
} from "@/domains/jobs/lib/provider-call-view";
import {
  buildProviderCallList,
  buildProviderCallRecord,
} from "@/testing/records";

const hashedBody = {
  ...buildProviderCallList().calls[0]?.body,
  kind: "response",
  state: "hashed",
  reason: "over_limit",
  sha256: "a".repeat(64),
  bytes: 5_242_880,
  contentType: null,
  isDownloadable: false,
} as const;

describe("formatByteSize", () => {
  it("reads a size in bytes, KiB and MiB", () => {
    expect(formatByteSize(321)).toBe("321 B");
    expect(formatByteSize(2048)).toBe("2.0 KiB");
    expect(formatByteSize(5_242_880)).toBe("5.0 MiB");
  });
});

describe("formatCallDuration", () => {
  it("reads milliseconds and seconds, and a dash for none", () => {
    expect(formatCallDuration(120)).toBe("120 ms");
    expect(formatCallDuration(1500)).toBe("1.5 s");
    expect(formatCallDuration(null)).toBe("—");
  });
});

describe("callOutcomeLabel", () => {
  it("names each way a call can end, including none recorded", () => {
    expect(callOutcomeLabel(buildProviderCallRecord())).toBe("200");
    expect(
      callOutcomeLabel(
        buildProviderCallRecord({ outcome: "failed", failureReason: "dns" })
      )
    ).toBe("Failed (dns)");
    expect(
      callOutcomeLabel(buildProviderCallRecord({ outcome: "unfinished" }))
    ).toBe("Unfinished");
    expect(
      callOutcomeLabel(buildProviderCallRecord({ outcome: "served_from" }))
    ).toBe("Served from cache");
    expect(callOutcomeLabel(buildProviderCallRecord({ outcome: null }))).toBe(
      "No outcome recorded"
    );
  });

  it("marks only a failed or unfinished call as a failure", () => {
    expect(isCallFailure(buildProviderCallRecord({ outcome: "failed" }))).toBe(
      true
    );
    expect(
      isCallFailure(buildProviderCallRecord({ outcome: "unfinished" }))
    ).toBe(true);
    expect(isCallFailure(buildProviderCallRecord())).toBe(false);
    expect(isCallFailure(buildProviderCallRecord({ outcome: null }))).toBe(
      false
    );
  });
});

describe("bodySummary", () => {
  it("says what is kept of a body and why a body was not", () => {
    expect(bodySummary({ ...hashedBody, state: "none", bytes: null })).toBe(
      "No body"
    );
    expect(bodySummary({ ...hashedBody, state: "stored", reason: null })).toBe(
      "Stored · 5.0 MiB"
    );
    expect(bodySummary(hashedBody)).toBe(
      "Not stored (over the keep limit) · 5.0 MiB"
    );
    expect(
      bodySummary({ ...hashedBody, state: "partial", reason: "byte_cap" })
    ).toBe("Partly read (the byte cap was reached) · 5.0 MiB");
  });
});
