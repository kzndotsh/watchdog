import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import {
  getEvidenceFn,
  listEvidencePickerPageFn,
  processEvidenceFn,
} from "@/domains/intake/intake.functions";
import { buildJobRecord } from "@/testing/records";
import { callServerFn, orpc, orpcNotFound } from "@/testing/server-fn";
import { testId } from "@watchdog/test-kit";

const CASE_ID = testId(10);
const EVIDENCE_ID = testId(1);

beforeEach(() => orpc.reset());

describe("getEvidenceFn", () => {
  it("answers null when the Evidence is gone", async () => {
    orpc.fail("evidence.get", orpcNotFound());

    await expect(
      callServerFn(getEvidenceFn, { caseId: CASE_ID, evidenceId: EVIDENCE_ID })
    ).resolves.toBeNull();
  });

  it("rethrows any other API failure", async () => {
    orpc.fail("evidence.get", new Error("db down"));

    await expect(
      callServerFn(getEvidenceFn, { caseId: CASE_ID, evidenceId: EVIDENCE_ID })
    ).rejects.toThrow("db down");
  });
});

describe("processEvidenceFn", () => {
  it("sends only the ids and the AI flag", async () => {
    orpc.reply("evidence.process", buildJobRecord());

    await callServerFn(processEvidenceFn, {
      caseId: CASE_ID,
      evidenceId: EVIDENCE_ID,
      ai: true,
    });

    expect(orpc.calls("evidence.process")).toEqual([
      { caseId: CASE_ID, evidenceId: EVIDENCE_ID, ai: true },
    ]);
  });
});

describe("input validation", () => {
  it("refuses an Evidence id that is not a uuid", async () => {
    await expect(
      callServerFn(getEvidenceFn, { caseId: CASE_ID, evidenceId: "x" })
    ).rejects.toThrow();

    expect(orpc.calls("evidence.get")).toEqual([]);
  });

  it("trims a padded Case id on the picker page read", async () => {
    orpc.reply("evidence.pickerPage", {
      items: [],
      nextCursor: null,
      total: null,
    });

    await callServerFn(listEvidencePickerPageFn, {
      caseId: `  ${CASE_ID}  `,
      q: "memo",
    });

    expect(orpc.calls("evidence.pickerPage")).toMatchObject([
      { caseId: CASE_ID, q: "memo" },
    ]);
  });
});
