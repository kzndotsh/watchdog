import type { CollectRunMode } from "@/domains/collect/components/collect-action-controls";
import {
  JobCapRunForm,
  type CapRunVars,
} from "@/domains/jobs/components/job-cap-run-form";
import {
  JobPlaybookRunForm,
  type PlaybookRunVars,
} from "@/domains/jobs/components/job-playbook-run-form";
import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";

export interface CollectRunFormPanelProps {
  runMode: CollectRunMode;
  playbooks: PlaybookListItem[];
  caps: CapListItem[];
  urlDumps: { id: string; sourceUrl: string; label: string | null }[];
  entities: { id: string; name: string }[];
  allowThirdPartyEgress: boolean;
  configuredCredentials: Set<string>;
  runError: string | null;
  onRunPlaybook: (vars: PlaybookRunVars) => Promise<void>;
  onRunCap: (vars: CapRunVars) => Promise<void>;
}

export function CollectRunFormPanel({
  runMode,
  playbooks,
  caps,
  urlDumps,
  entities,
  allowThirdPartyEgress,
  configuredCredentials,
  runError,
  onRunPlaybook,
  onRunCap,
}: CollectRunFormPanelProps) {
  if (runMode === "playbook") {
    return (
      <JobPlaybookRunForm
        playbooks={playbooks}
        urlDumps={urlDumps}
        entities={entities}
        allowThirdPartyEgress={allowThirdPartyEgress}
        configuredCredentials={configuredCredentials}
        runError={runError}
        onRunPlaybook={onRunPlaybook}
        layout="stacked"
      />
    );
  }
  return (
    <JobCapRunForm
      caps={caps}
      entities={entities}
      allowThirdPartyEgress={allowThirdPartyEgress}
      configuredCredentials={configuredCredentials}
      runError={runError}
      onRunCap={onRunCap}
      layout="stacked"
    />
  );
}
