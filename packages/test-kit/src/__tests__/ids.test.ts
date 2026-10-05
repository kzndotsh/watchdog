import { describe, expect, it } from "vitest";

import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
  testActor,
  testCaseId,
  testId,
} from "../fixtures/ids";

describe("branded id fixtures", () => {
  it("testCaseId is the branded testId", () => {
    expect(testCaseId(1)).toBe(testId(1));
  });

  it("organization fixtures are distinct", () => {
    expect(TEST_ORGANIZATION_ID).not.toBe(TEST_OTHER_ORGANIZATION_ID);
  });

  it("testActor defaults to TEST_ORGANIZATION_ID and accepts overrides", () => {
    expect(testActor().organizationId).toBe(TEST_ORGANIZATION_ID);
    expect(testActor({ organizationId: null }).organizationId).toBeNull();
    expect(testActor({ userId: "u2" }).userId).toBe("u2");
  });
});
