import { describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(
  () => [] as ((input: unknown) => Promise<unknown>)[]
);

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (handler: (input: unknown) => Promise<unknown>) => {
        handlers.push(handler);
        return `fn-${handlers.length}`;
      },
    }),
  }),
}));

const evidenceApi = vi.hoisted(() => ({
  list: vi.fn(),
  pickerPage: vi.fn(),
}));

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: vi.fn(() => ({ evidence: evidenceApi })),
}));

import { listEvidencePickerPageFn } from "@/domains/intake/intake.functions";

describe("listEvidencePickerPageFn", () => {
  it("passes the list's input whole to evidence.pickerPage", async () => {
    const page = { items: [], nextCursor: null, total: null };
    evidenceApi.pickerPage.mockResolvedValue(page);
    expect(listEvidencePickerPageFn).toBe("fn-3");
    const input = {
      caseId: "550e8400-e29b-41d4-a716-446655440000",
      limit: 20,
      q: "memo",
    };
    expect(await handlers[2]?.({ data: input, context: {} })).toBe(page);
    expect(evidenceApi.pickerPage).toHaveBeenCalledWith(input);
  });
});
