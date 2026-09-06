import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

import { claimRowActions } from "../claim-row-actions.ts";
import { connectionRowActions } from "../connection-row-actions.ts";
import { eventRowActions } from "../event-row-actions.ts";
import {
  openQuestionRowActions,
  resolvedQuestionRowActions,
} from "../question-row-actions.ts";

describe("dossier row action factories", () => {
  it("builds connection actions", () => {
    const onOpenPeer = vi.fn();
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    const edge = {
      id: testId(1),
      peerSlug: "peer",
      peerName: "Peer",
      peerId: testId(2),
    } as Parameters<typeof connectionRowActions>[0];

    const actions = connectionRowActions(edge, {
      onOpenPeer,
      onEdit,
      onRemove,
    });
    expect(actions.map((a) => a.id)).toEqual([
      "connection-open-peer",
      "connection-edit",
      "connection-remove",
    ]);
    actions[2]?.run();
    expect(onRemove).toHaveBeenCalledWith(edge.id);
  });

  it("builds event actions", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const actions = eventRowActions({ onEdit, onDelete });
    expect(actions.map((a) => a.id)).toEqual(["event-edit", "event-delete"]);
    expect(actions[1]?.destructive).toBe(true);
  });

  it("builds claim actions", () => {
    const onEdit = vi.fn();
    const onAction = vi.fn();
    const claim = { id: testId(3), text: "Claim" } as Parameters<
      typeof claimRowActions
    >[0];
    const actions = claimRowActions(claim, { onEdit, onAction });
    expect(actions.map((a) => a.id)).toEqual([
      "claim-edit",
      "claim-contest",
      "claim-disprove",
      "claim-retract",
    ]);
    actions[3]?.run();
    expect(onAction).toHaveBeenCalledWith(claim.id, "retract");
  });

  it("builds open and resolved question actions", () => {
    expect(
      openQuestionRowActions({ onEdit: vi.fn(), onResolve: vi.fn() }).map(
        (a) => a.id
      )
    ).toEqual(["question-edit", "question-resolve"]);
    expect(
      resolvedQuestionRowActions({ onEdit: vi.fn(), onReopen: vi.fn() }).map(
        (a) => a.id
      )
    ).toEqual(["question-edit", "question-reopen"]);
  });
});
