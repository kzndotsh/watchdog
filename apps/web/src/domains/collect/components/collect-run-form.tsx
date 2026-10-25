import type { CaseEgress } from "@/domains/cases/types";
import type { CollectRunMode } from "@/domains/collect/components/collect-run-mode-toggle";
import {
  JobCapRunForm,
  type CapRunVars,
} from "@/domains/jobs/components/job-cap-run-form";
import {
  JobPlaybookRunForm,
  type PlaybookRunVars,
} from "@/domains/jobs/components/job-playbook-run-form";
import type { CapRunPrefill } from "@/domains/jobs/lib/cap-run-input";
import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import type { EntityOption } from "@/shared/ui/entity-combobox";

export type CollectRunFormProps = {
  runMode: CollectRunMode;
  playbooks: PlaybookListItem[];
  caps: CapListItem[];
  urlDumps: { id: string; sourceUrl: string; label: string | null }[];
  entities: EntityOption[];
  caseEgress: CaseEgress;
  configuredCredentials: Set<string>;
  runError: string | null;
  onRunPlaybook: (vars: PlaybookRunVars) => Promise<void>;
  onRunCap: (vars: CapRunVars) => Promise<void>;
  /** Cap form values to start from (Edit and re-run). */
  prefill?: CapRunPrefill;
  /** Playbook form: the Playbook to start on. */
  initialPlaybookId?: string;
};

export function CollectRunForm({
  runMode,
  playbooks,
  caps,
  urlDumps,
  entities,
  caseEgress,
  configuredCredentials,
  runError,
  onRunPlaybook,
  onRunCap,
  prefill,
  initialPlaybookId,
}: CollectRunFormProps) {
  if (runMode === "playbook") {
    return (
      <JobPlaybookRunForm
        playbooks={playbooks}
        urlDumps={urlDumps}
        entities={entities}
        caseEgress={caseEgress}
        configuredCredentials={configuredCredentials}
        runError={runError}
        onRunPlaybook={onRunPlaybook}
        layout="stacked"
        initialPlaybookId={initialPlaybookId}
      />
    );
  }
  return (
    <JobCapRunForm
      caps={caps}
      entities={entities}
      caseEgress={caseEgress}
      configuredCredentials={configuredCredentials}
      runError={runError}
      onRunCap={onRunCap}
      prefill={prefill}
      layout="stacked"
    />
  );
}
