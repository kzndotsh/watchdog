import type { ClaimRecord } from "@/domains/entities/claims/types";
import type { AppAction } from "@/shared/lib/app-action";

export type ClaimRowActionKind = "contest" | "disprove" | "retract";

export interface ClaimRowActionHandlers {
  onEdit: (claim: ClaimRecord) => void;
  onAction: (claimId: string, action: ClaimRowActionKind) => void;
}

/** Shared ⋯ + ContextMenu actions for dossier claim rows. */
export function claimRowActions(
  claim: ClaimRecord,
  handlers: ClaimRowActionHandlers
): AppAction[] {
  return [
    {
      id: "claim-edit",
      label: "Edit",
      group: "target",
      run: () => {
        handlers.onEdit(claim);
      },
    },
    {
      id: "claim-contest",
      label: "Contest",
      group: "target",
      run: () => {
        handlers.onAction(claim.id, "contest");
      },
    },
    {
      id: "claim-disprove",
      label: "Disprove",
      group: "target",
      run: () => {
        handlers.onAction(claim.id, "disprove");
      },
    },
    {
      id: "claim-retract",
      label: "Retract",
      group: "target",
      destructive: true,
      run: () => {
        handlers.onAction(claim.id, "retract");
      },
    },
  ];
}
