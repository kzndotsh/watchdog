import {
  emailBreach,
  emailCorpus,
  emailIdentity,
  emailIdentityPlus,
  evidenceFile,
  handlePresence,
  hashMalware,
  hashMalwarePlus,
  hostContacts,
  hostEnumerate,
  hostFootprint,
  hostPosture,
  hostReputation,
  ipContext,
  ipExposure,
  ipNoise,
  ipReputation,
  urlCapture,
  urlCaptureAi,
  urlHistory,
  urlReputation,
  urlReputationPlus,
  urlResolve,
} from "./definitions";
import {
  toPlaybookDescriptor,
  type PlaybookDef,
  type PlaybookDescriptor,
} from "./plan";

export const PLAYBOOKS: readonly PlaybookDef[] = [
  hostFootprint,
  hostPosture,
  hostReputation,
  hostContacts,
  hostEnumerate,
  urlCapture,
  urlCaptureAi,
  urlHistory,
  urlReputation,
  urlReputationPlus,
  urlResolve,
  ipContext,
  ipReputation,
  ipExposure,
  ipNoise,
  emailIdentity,
  emailIdentityPlus,
  emailBreach,
  emailCorpus,
  hashMalware,
  hashMalwarePlus,
  handlePresence,
  evidenceFile,
];

export function listPlaybooks(): PlaybookDef[] {
  return [...PLAYBOOKS];
}

export function listPlaybookDescriptors(): PlaybookDescriptor[] {
  return PLAYBOOKS.map(toPlaybookDescriptor);
}

export function requirePlaybook(id: string): PlaybookDef {
  const found = PLAYBOOKS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown playbook: ${id}`);
  return found;
}

export {
  checkPlaybookAvailability,
  checkCapabilityAvailability,
  formatPlanError,
  hostFromUrl,
  isPlanError,
  materializeBoundInput,
  materializeFanOutInputs,
  normalizePlaybookStep,
  planPlaybook,
  playbookCapabilityIds,
  predecessorFromJob,
  seedValuesToCandidateInput,
  seedValuesFromJson,
  seedValuesToJson,
  toPlaybookDescriptor,
  derivePlaybookRequires,
  type AvailabilityError,
  type AvailabilityResult,
  type BindBag,
  type PlannedStep,
  type PlaybookDef,
  type PlaybookDescriptor,
  type PlaybookPlan,
  type PlaybookRequires,
  type CapabilityRequires,
  type PlaybookStepDef,
  type PlanError,
  type PredecessorJob,
  type SeedValues,
} from "./plan";
export {
  decidePlaybookAdvance,
  type PlaybookAdvance,
  type PlaybookJobView,
} from "./advance";
