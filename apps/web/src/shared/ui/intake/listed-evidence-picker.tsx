import { useStaticPickerSource } from "@/shared/hooks/use-static-picker-source";
import {
  evidenceMatchesPickerFilter,
  type EvidenceOption,
} from "@/shared/ui/intake/evidence-option";
import { EvidencePicker } from "@/shared/ui/intake/evidence-picker";

type ListedEvidencePickerProps = {
  /** Evidence the screen already holds, filtered in the browser as the user types. */
  options: readonly EvidenceOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  shouldDashWhenEmpty?: boolean;
  layout?: "trigger" | "panel";
};

/** The Evidence picker over a list the screen holds (Triage). Case-wide pickers use `SearchedEvidencePicker`. */
export function ListedEvidencePicker({
  options,
  ...rest
}: ListedEvidencePickerProps) {
  const source = useStaticPickerSource(options, evidenceMatchesPickerFilter);
  return <EvidencePicker {...rest} source={source} />;
}
