import { ArrowUpRightIcon } from "lucide-react";

import { Chip } from "@/shared/ui/chip";

/** Separate from readiness: the entry sends the viewer's input to a third party. */
export function LibraryEgressMark() {
  return (
    <Chip
      size="md"
      className="shrink-0"
      title="Sends your input to a third party"
    >
      <ArrowUpRightIcon aria-hidden className="size-3" />
      Third party
    </Chip>
  );
}
