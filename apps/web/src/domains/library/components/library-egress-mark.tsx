import { GlobeIcon } from "lucide-react";

import { Chip } from "@/shared/ui/chip";

/** Separate from readiness: the entry sends the viewer's input to a third party. */
export function LibraryEgressMark() {
  return (
    <Chip
      size="sm"
      className="shrink-0"
      title="Sends your input to a third party"
    >
      <GlobeIcon aria-hidden className="size-3" />
      Third party
    </Chip>
  );
}
