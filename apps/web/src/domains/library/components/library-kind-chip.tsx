import { WorkflowIcon, ZapIcon } from "lucide-react";

import type { LibraryEntryKind } from "@/domains/library/types";
import { Chip } from "@/shared/ui/chip";

/** "Cap" (one action) or "Playbook" (a chain of Caps), with an icon for each. */
export function LibraryKindChip({ kind }: { kind: LibraryEntryKind }) {
  return (
    <Chip size="md" className="shrink-0">
      {kind === "cap" ? (
        <ZapIcon aria-hidden className="size-3" />
      ) : (
        <WorkflowIcon aria-hidden className="size-3" />
      )}
      {kind === "cap" ? "Cap" : "Playbook"}
    </Chip>
  );
}
