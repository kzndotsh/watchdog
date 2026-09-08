import { describe, expect, it } from "vitest";

import {
  taskCreateInputSchema,
  taskFiltersSchema,
  taskReorderInputSchema,
  taskUpdateInputSchema,
} from "../tasks";

const caseId = "00000000-0000-4000-8000-000000000001";
const taskId = "00000000-0000-4000-8000-000000000003";

describe("taskFiltersSchema", () => {
  const entityId = "00000000-0000-4000-8000-000000000002";

  it("rejects entityId with unattachedOnly", () => {
    const result = taskFiltersSchema.safeParse({
      caseId,
      entityId,
      unattachedOnly: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts unattachedOnly without entityId", () => {
    const result = taskFiltersSchema.safeParse({
      caseId,
      unattachedOnly: true,
    });
    expect(result.success).toBe(true);
  });

  it("trims padded case and entity ids", () => {
    expect(
      taskFiltersSchema.parse({
        caseId: `  ${caseId}  `,
        entityId: `  ${entityId}  `,
      })
    ).toEqual({ caseId, entityId });
  });

  it("trims padded status filter", () => {
    expect(
      taskFiltersSchema.parse({
        caseId,
        status: "  backlog  ",
      }).status
    ).toBe("backlog");
  });
});

describe("taskCreateInputSchema", () => {
  it("collapses blank description to absent", () => {
    expect(
      taskCreateInputSchema.parse({
        caseId,
        title: "Follow up",
        description: "   ",
      })
    ).toEqual({
      caseId,
      title: "Follow up",
    });
  });

  it("trims padded case and entity ids", () => {
    const entityId = "00000000-0000-4000-8000-000000000002";
    expect(
      taskCreateInputSchema.parse({
        caseId: `  ${caseId}  `,
        title: "Follow up",
        entityId: `  ${entityId}  `,
      })
    ).toMatchObject({ caseId, entityId });
  });

  it("trims padded task status on create", () => {
    expect(
      taskCreateInputSchema.parse({
        caseId,
        title: "Follow up",
        status: "  backlog  ",
      }).status
    ).toBe("backlog");
  });

  it("trims padded task priority on create", () => {
    expect(
      taskCreateInputSchema.parse({
        caseId,
        title: "Follow up",
        priority: "  high  ",
      }).priority
    ).toBe("high");
  });

  it("trims padded due date on create", () => {
    expect(
      taskCreateInputSchema.parse({
        caseId,
        title: "Follow up",
        dueDate: "  2026-06-15  ",
      }).dueDate
    ).toBe("2026-06-15");
  });
});

describe("taskUpdateInputSchema", () => {
  it("trims description and collapses whitespace to null", () => {
    expect(
      taskUpdateInputSchema.parse({
        caseId,
        taskId,
        description: "   ",
      })
    ).toEqual({
      caseId,
      taskId,
      description: null,
    });
    expect(
      taskUpdateInputSchema.parse({
        caseId,
        taskId,
        description: "  notes  ",
      })
    ).toMatchObject({ description: "notes" });
  });

  it("rejects invalid due dates", () => {
    expect(
      taskCreateInputSchema.safeParse({
        caseId,
        title: "Follow up",
        dueDate: "not-a-date",
      }).success
    ).toBe(false);
    expect(
      taskUpdateInputSchema.safeParse({
        caseId,
        taskId,
        dueDate: "not-a-date",
      }).success
    ).toBe(false);
    expect(
      taskCreateInputSchema.safeParse({
        caseId,
        title: "Follow up",
        dueDate: "2024-02-31",
      }).success
    ).toBe(false);
  });

  it("accepts null due date to clear on update", () => {
    expect(
      taskUpdateInputSchema.parse({
        caseId,
        taskId,
        dueDate: null,
      })
    ).toMatchObject({ dueDate: null });
  });

  it("treats whitespace-only due date as null on create and update", () => {
    expect(
      taskCreateInputSchema.parse({
        caseId,
        title: "Follow up",
        dueDate: "   ",
      })
    ).toMatchObject({ dueDate: null });
    expect(
      taskUpdateInputSchema.parse({
        caseId,
        taskId,
        dueDate: "   ",
      })
    ).toMatchObject({ dueDate: null });
  });
});

describe("taskReorderInputSchema", () => {
  it("trims and dedupes ordered ids", () => {
    const a = "00000000-0000-4000-8000-000000000010";
    const b = "00000000-0000-4000-8000-000000000011";
    expect(
      taskReorderInputSchema.parse({
        caseId: `  ${caseId}  `,
        status: "backlog",
        orderedIds: [` ${a} `, ` ${b} `, a],
      })
    ).toEqual({
      caseId,
      status: "backlog",
      orderedIds: [a, b],
    });
  });

  it("trims padded status on reorder", () => {
    const a = "00000000-0000-4000-8000-000000000010";
    expect(
      taskReorderInputSchema.parse({
        caseId,
        status: "  backlog  ",
        orderedIds: [a],
      }).status
    ).toBe("backlog");
  });

  it("rejects empty orderedIds after normalization", () => {
    expect(
      taskReorderInputSchema.safeParse({
        caseId,
        status: "backlog",
        orderedIds: ["   "],
      }).success
    ).toBe(false);
  });
});
