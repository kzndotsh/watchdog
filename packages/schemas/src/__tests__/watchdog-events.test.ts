import { describe, expect, it } from "vitest";

import { isWatchdogEvent } from "../watchdog-events";

describe("watchdog events", () => {
  it("parses evidence_changed payloads", () => {
    expect(
      isWatchdogEvent({
        type: "evidence_changed",
        caseId: "00000000-0000-4000-8000-000000000001",
        evidenceId: "00000000-0000-4000-8000-000000000002",
      })
    ).toBe(true);
  });

  it("parses proposal_queue_changed payloads", () => {
    expect(
      isWatchdogEvent({
        type: "proposal_queue_changed",
        caseId: "00000000-0000-4000-8000-000000000001",
      })
    ).toBe(true);
  });

  it("rejects malformed case ids", () => {
    expect(
      isWatchdogEvent({
        type: "entity_changed",
        caseId: "not-a-uuid",
      })
    ).toBe(false);
  });

  it("trims padded case ids on ingress", () => {
    const caseId = "00000000-0000-4000-8000-000000000001";
    expect(
      isWatchdogEvent({
        type: "entity_changed",
        caseId: `  ${caseId}  `,
      })
    ).toBe(true);
  });
});
