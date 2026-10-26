import { useState } from "react";

import {
  usePickerSource,
  type PickerPort,
} from "@/shared/hooks/use-picker-source";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { EvidencePicker } from "@/shared/ui/intake/evidence-picker";

type SearchedEvidencePickerProps = {
  /** The Case's Evidence list through the domain (`evidencePickerPort(caseId)`). */
  port: PickerPort<EvidenceOption>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  shouldDashWhenEmpty?: boolean;
  layout?: "trigger" | "panel";
};

/**
 * The Evidence picker searched on the server (#559): recent Evidence while the box is empty,
 * matches from 3 characters, one small page either way; selected chips titled by id. The
 * `trigger` layout reads options only while its popover is open; a `panel` is mounted open.
 */
export function SearchedEvidencePicker({
  port,
  selectedIds,
  layout = "trigger",
  ...rest
}: SearchedEvidencePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const source = usePickerSource(port, selectedIds, {
    isEnabled: layout === "panel" || isOpen,
  });
  return (
    <EvidencePicker
      {...rest}
      source={source}
      selectedIds={selectedIds}
      layout={layout}
      onOpenChange={setIsOpen}
    />
  );
}
