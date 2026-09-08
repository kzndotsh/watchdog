import {
  CalendarIcon,
  CircleHelpIcon,
  FingerprintIcon,
  GitBranchIcon,
  MessageSquareTextIcon,
  UserRoundIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import type { VocabTone } from "@/shared/ui/vocab/vocab-badge";
import {
  patchOpVerbLabel,
  patchResourceLabel,
  type PatchOp,
} from "@watchdog/schemas";

type Op = PatchOp["op"];
type Resource = PatchOp["resource"];

export const PATCH_OP_TONES: Record<Op, VocabTone> = {
  create: {
    low: "bg-status-succeeded-bg text-status-succeeded-fg",
    high: "bg-status-succeeded text-primary-foreground",
  },
  upsert: {
    low: "bg-status-running-bg text-status-running-fg",
    high: "bg-status-running text-primary-foreground",
  },
  update: {
    low: "bg-status-pending-bg text-status-pending-fg",
    high: "bg-status-pending text-signal-foreground",
  },
};

export const PATCH_RESOURCE_META: Record<
  Resource,
  { label: string; Icon: ComponentType<{ className?: string }> }
> = {
  claim: { label: patchResourceLabel("claim"), Icon: MessageSquareTextIcon },
  identifier: {
    label: patchResourceLabel("identifier"),
    Icon: FingerprintIcon,
  },
  edge: { label: patchResourceLabel("edge"), Icon: GitBranchIcon },
  entity: { label: patchResourceLabel("entity"), Icon: UserRoundIcon },
  event: { label: patchResourceLabel("event"), Icon: CalendarIcon },
  question: { label: patchResourceLabel("question"), Icon: CircleHelpIcon },
};

export function patchOpLabel(op: Op): string {
  return patchOpVerbLabel(op);
}
