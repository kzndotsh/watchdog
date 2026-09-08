import { describe, expect, it } from "vitest";

import {
  createEventInputSchema,
  updateEventInputSchema,
} from "@/domains/entities/events/types";
import { testId } from "@watchdog/test-kit";

describe("events types schemas", () => {
  it("parses create and update event payloads", () => {
    expect(
      createEventInputSchema.parse({
        caseId: testId(10),
        entityId: testId(20),
        when: "2026-01-01",
        what: "Met at the office",
        where: " NYC ",
      })
    ).toMatchObject({
      what: "Met at the office",
      where: "NYC",
    });

    expect(
      updateEventInputSchema.parse({
        caseId: testId(10),
        eventId: testId(1),
        when: "2026-01-02",
        what: "Follow-up call",
      }).what
    ).toBe("Follow-up call");

    expect(
      updateEventInputSchema.parse({
        caseId: testId(10),
        eventId: testId(1),
        what: "Only what changed",
      }).what
    ).toBe("Only what changed");

    expect(
      updateEventInputSchema.safeParse({
        caseId: testId(10),
        eventId: testId(1),
      }).success
    ).toBe(false);

    expect(
      updateEventInputSchema.parse({
        caseId: testId(10),
        eventId: testId(1),
        where: null,
      }).where
    ).toBeNull();
  });
});
