import { useCallback, useState } from "react";

import type { CollectRunMode } from "@/domains/collect/components/collect-run-mode-toggle";
import type { CollectRunTarget } from "@/domains/collect/lib/collect-run-target";
import {
  capRunPrefillFromJob,
  type CapRunPrefill,
} from "@/domains/jobs/lib/cap-run-input";
import type { CapListItem } from "@/domains/jobs/types";
import type { JobRecord } from "@watchdog/core/jobs";

/**
 * The Run popover's state: its mode, whether it is open, and what it starts on (a Library link's
 * Cap or Playbook, or the selected Job's Cap and input for Edit and re-run).
 */
export function useCollectRunForm({
  runTarget,
  caps,
  detailJob,
}: {
  /** Open the Run form on this Cap or Playbook (a link from the Library). */
  runTarget?: CollectRunTarget;
  caps: CapListItem[];
  /** The selected Job, for Edit and re-run. */
  detailJob: JobRecord | null;
}) {
  const [runMode, setRunMode] = useState<CollectRunMode>(
    runTarget?.kind ?? "cap"
  );
  const [isRunOpen, setIsRunOpen] = useState(runTarget !== undefined);
  const [rerun, setRerun] = useState<{
    prefill: CapRunPrefill;
    key: number;
  } | null>(
    runTarget?.kind === "cap"
      ? {
          prefill: { capabilityId: runTarget.id, runInput: "", entityId: "" },
          key: 1,
        }
      : null
  );
  const [playbookId, setPlaybookId] = useState(
    runTarget?.kind === "playbook" ? runTarget.id : undefined
  );
  // An ordinary Run must not open with the last Edit and re-run's values.
  const handleRunOpenChange = useCallback((isOpen: boolean) => {
    setIsRunOpen(isOpen);
    if (!isOpen) {
      setRerun(null);
      setPlaybookId(undefined);
    }
  }, []);
  const handleEditAndRerun = useCallback(() => {
    if (detailJob === null) return;
    const cap = caps.find((c) => c.id === detailJob.capabilityId);
    setRunMode("cap");
    setRerun((prev) => ({
      prefill: capRunPrefillFromJob(detailJob, cap?.inputForm),
      key: (prev?.key ?? 0) + 1,
    }));
    setIsRunOpen(true);
  }, [caps, detailJob]);

  return {
    runMode,
    setRunMode,
    rerun,
    initialPlaybookId: playbookId,
    isRunOpen,
    handleRunOpenChange,
    handleEditAndRerun,
  };
}
