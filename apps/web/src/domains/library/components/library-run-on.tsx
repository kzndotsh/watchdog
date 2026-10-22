import { useNavigate } from "@tanstack/react-router";
import { PlayIcon } from "lucide-react";
import { useState } from "react";

import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import { collectRunTargetValue } from "@/domains/collect/lib/collect-run-target";
import { runBlockedReason } from "@/domains/library/lib/library-readiness";
import type { LibraryEntry } from "@/domains/library/types";
import { FieldSelect } from "@/shared/ui/field-select";
import { Button } from "@/shared/ui/primitives/button";

export type LibraryRunOnProps = {
  entry: Pick<LibraryEntry, "kind" | "id" | "readiness">;
};

/**
 * Run on…: pick a Case and open its Collect with this Cap or Playbook already chosen.
 * Running always happens in Collect, so this only navigates. Off, with the reason, until
 * the entry is ready.
 */
export function LibraryRunOn({ entry }: LibraryRunOnProps) {
  const navigate = useNavigate();
  const { cases, active, pending } = useCasesContext({ silentError: true });
  const [pickedId, setPickedId] = useState("");

  const chosen =
    cases.find((row) => row.id === pickedId) ?? active ?? cases[0] ?? null;
  const blocked = runBlockedReason(entry.readiness);
  let reason = blocked;
  if (reason === null && !pending && cases.length === 0) {
    reason = "Create a Case first.";
  }
  const isDisabled = reason !== null || chosen === null;
  const noun = entry.kind === "cap" ? "Cap" : "Playbook";

  const handleRun = () => {
    if (chosen === null) return;
    void navigate({
      to: "/cases/$caseSlug/collect",
      params: { caseSlug: chosen.slug },
      search: { run: collectRunTargetValue(entry) },
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <FieldSelect
          aria-label="Case to run on"
          className="w-48"
          value={chosen?.id ?? ""}
          onValueChange={setPickedId}
          options={cases.map((row) => ({ value: row.id, label: row.name }))}
          placeholder={pending ? "Loading Cases…" : "No Cases"}
          disabled={cases.length === 0}
        />
        <Button
          type="button"
          variant="outline"
          disabled={isDisabled}
          onClick={handleRun}
        >
          <PlayIcon data-icon="inline-start" />
          Run on…
        </Button>
      </div>
      {reason === null ? (
        <p className="text-muted-foreground text-xs">
          Opens Collect in that Case with this {noun} chosen.
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">{reason}</p>
      )}
    </div>
  );
}
