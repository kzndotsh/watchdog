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

const listForCase = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orpc.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orpc.server")>();
  return {
    orpcNullIfNotFound: actual.orpcNullIfNotFound,
    orpcFromContext: vi.fn(() => ({ proposals: { listForCase, get } })),
  };
});

import {
  getProposalFn,
  listProposalsPageFn,
} from "@/domains/triage/triage.functions";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440000";
const PROPOSAL_ID = "660e8400-e29b-41d4-a716-446655440001";

describe("triage ServerFns", () => {
  it("passes one page's input to proposals.listForCase whole", async () => {
    expect(listProposalsPageFn).toBe("fn-1");
    const page = { items: [], nextCursor: null, total: null };
    listForCase.mockResolvedValueOnce(page);
    const data = { caseId: CASE_ID, status: ["pending"], limit: 50 };
    await expect(handlers[0]?.({ data, context: {} })).resolves.toBe(page);
    expect(listForCase).toHaveBeenCalledWith(data);
  });

  it("reads one Proposal by id through proposals.get", async () => {
    expect(getProposalFn).toBe("fn-2");
    get.mockResolvedValueOnce({ id: PROPOSAL_ID });
    await expect(
      handlers[1]?.({
        data: { caseId: CASE_ID, proposalId: PROPOSAL_ID },
        context: {},
      })
    ).resolves.toEqual({ id: PROPOSAL_ID });
    expect(get).toHaveBeenCalledWith({
      caseId: CASE_ID,
      proposalId: PROPOSAL_ID,
    });
  });
});
