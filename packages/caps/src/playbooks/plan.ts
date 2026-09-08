import type {
  CapDescriptorCredential,
  CapEgress,
  CapFlag,
  CapIoKind,
} from "@watchdog/cap-sdk";
import { toCapDescriptor } from "@watchdog/cap-sdk";
import {
  parseCapJobInput,
  parseGraphUuidList,
  type HandoffBag,
  type JobHandoff,
  type JsonObject,
  type PlaybookSeedKind,
} from "@watchdog/schemas";

import { CAPABILITIES, requireCapability } from "../registry";
import {
  presentSeedKinds,
  seedKindToCapIo,
  seedField,
  seedValuesToCandidateInput,
  type SeedValues,
} from "./seed";

export type { JobHandoff, PlaybookSeedKind, SeedValues };
export {
  hostFromUrl,
  seedValuesToCandidateInput,
  seedValuesFromJson,
  seedValuesToJson,
} from "./seed";

export type BindBag = HandoffBag | "evidenceId";

export type PlaybookStepBind =
  | { seed: PlaybookSeedKind }
  | { step: number; bag: BindBag; index?: number };

export interface PlaybookStepFanOut {
  from: { step: number; bag: HandoffBag };
  to: string;
  max?: number;
}

export interface PlaybookStepDef {
  capabilityId: string;
  input?: JsonObject;
  bind?: Record<string, PlaybookStepBind>;
  fanOut?: PlaybookStepFanOut;
}

export type PlaybookStep = string | PlaybookStepDef;

export interface PlaybookDef {
  id: string;
  title: string;
  description: string;
  seedKinds: readonly [PlaybookSeedKind, ...PlaybookSeedKind[]];
  steps: readonly PlaybookStep[];
}

export interface PlannedStep {
  capabilityId: string;
  input: JsonObject;
  playbookStep: number;
}

export interface PlaybookPlan {
  playbookId: string;
  step: PlannedStep;
}

export type PlanError =
  | { kind: "missing_seed"; seed: PlaybookSeedKind }
  | { kind: "unknown_cap"; capabilityId: string }
  | { kind: "unsatisfied_step"; capabilityId: string; needs: CapIoKind }
  | { kind: "invalid_input"; capabilityId: string; message: string }
  | { kind: "invalid_playbook"; message: string };

export interface PlaybookRequires {
  credentials: CapDescriptorCredential[];
  egress: CapEgress;
  flags: CapFlag[];
}

/** Credential/egress requirements for a single Cap (same wire shape as playbooks). */
export type CapabilityRequires = PlaybookRequires;

export interface PlaybookDescriptor {
  id: string;
  title: string;
  description: string;
  seedKinds: PlaybookSeedKind[];
  steps: string[];
  requires: PlaybookRequires;
}

export type AvailabilityError =
  | { ok: false; kind: "missing_credential"; names: readonly string[] }
  | { ok: false; kind: "egress_blocked"; capabilityId: string };

export type AvailabilityResult = { ok: true } | AvailabilityError;

export interface PredecessorJob {
  step: number;
  bags: Partial<Record<BindBag, string[]>>;
}

export function predecessorFromJob(row: {
  playbookStep?: number | null;
  evidenceIds?: readonly string[] | null;
  handoff?: JobHandoff | null;
}): PredecessorJob {
  return {
    step: row.playbookStep ?? 0,
    bags: {
      ...row.handoff,
      evidenceId: parseGraphUuidList(row.evidenceIds ?? []) ?? [],
    },
  };
}

export function normalizePlaybookStep(step: PlaybookStep): PlaybookStepDef {
  if (typeof step === "string") {
    return { capabilityId: step };
  }
  return step;
}

export function playbookCapabilityIds(playbook: PlaybookDef): string[] {
  return playbook.steps.map((s) => normalizePlaybookStep(s).capabilityId);
}

export function isPlanError(
  value: PlanError | JsonObject | JsonObject[]
): value is PlanError {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }
  const kind = value.kind;
  return (
    kind === "missing_seed" ||
    kind === "unknown_cap" ||
    kind === "unsatisfied_step" ||
    kind === "invalid_input" ||
    kind === "invalid_playbook"
  );
}

function ioKey(io: CapIoKind): string {
  switch (io.kind) {
    case "identifier": {
      return `identifier:${io.type}`;
    }
    case "evidence": {
      return "evidence";
    }
    case "host": {
      return "host";
    }
    case "ip": {
      return "ip";
    }
    case "url": {
      return "url";
    }
    case "hash": {
      return "hash";
    }
    default: {
      const _exhaustive: never = io;
      return _exhaustive;
    }
  }
}

function mergeJson(
  base: Record<string, unknown>,
  overlay: JsonObject | undefined
): Record<string, unknown> {
  if (overlay === undefined) return { ...base };
  return { ...base, ...overlay };
}

function parseCapInput(
  capabilityId: string,
  candidate: Record<string, unknown>
): JsonObject | PlanError {
  const cap = requireCapability(capabilityId);
  const parsed = parseCapJobInput(cap.input, candidate);
  if (!parsed.ok) {
    return {
      kind: "invalid_input",
      capabilityId,
      message: parsed.message,
    };
  }
  return parsed.input;
}

function validateStepRefs(
  def: PlaybookStepDef,
  index: number
): PlanError | undefined {
  if (def.fanOut !== undefined) {
    if (index === 0) {
      return {
        kind: "invalid_playbook",
        message: `${def.capabilityId}: fan-out cannot be the first step`,
      };
    }
    if (def.fanOut.from.step >= index) {
      return {
        kind: "invalid_playbook",
        message: `${def.capabilityId}: fan-out source step must be earlier`,
      };
    }
  }
  if (def.bind === undefined) return undefined;
  for (const bind of Object.values(def.bind)) {
    if ("step" in bind && bind.step >= index) {
      return {
        kind: "invalid_playbook",
        message: `${def.capabilityId}: bind source step must be earlier`,
      };
    }
  }
  return undefined;
}

function findUnknownCap(defs: PlaybookStepDef[]): PlanError | undefined {
  for (const def of defs) {
    if (!CAPABILITIES.some((c) => c.id === def.capabilityId)) {
      return { kind: "unknown_cap", capabilityId: def.capabilityId };
    }
  }
  return undefined;
}

function buildSeedAvailability(
  playbook: PlaybookDef,
  present: Set<PlaybookSeedKind>
): Set<string> {
  const available = new Set(
    playbook.seedKinds.map((k) => ioKey(seedKindToCapIo(k)))
  );
  for (const k of present) available.add(ioKey(seedKindToCapIo(k)));
  return available;
}

function unsatisfiedConsumeError(
  def: PlaybookStepDef,
  available: Set<string>
): PlanError | undefined {
  const cap = requireCapability(def.capabilityId);
  const consumes = cap.consumes ?? [];
  const deferInput = def.bind !== undefined || def.fanOut !== undefined;
  if (consumes.length === 0 || deferInput) return undefined;
  const covered = consumes.some((c) => available.has(ioKey(c)));
  if (covered) return undefined;
  return {
    kind: "unsatisfied_step",
    capabilityId: def.capabilityId,
    needs: consumes[0],
  };
}

function resolveStepInput(
  def: PlaybookStepDef,
  candidate: Record<string, unknown>
): JsonObject | PlanError | "deferred" {
  const deferInput = def.bind !== undefined || def.fanOut !== undefined;
  if (deferInput) return "deferred";
  return parseCapInput(def.capabilityId, mergeJson(candidate, def.input));
}

function addProducesToAvailability(
  def: PlaybookStepDef,
  available: Set<string>
): void {
  const cap = requireCapability(def.capabilityId);
  for (const p of cap.produces ?? []) available.add(ioKey(p));
}

function validateStepAtPlanTime(
  def: PlaybookStepDef,
  candidate: Record<string, unknown>,
  stepIndex: number
): PlannedStep | PlanError | undefined {
  if (def.fanOut !== undefined) {
    return stepIndex === 0
      ? { capabilityId: def.capabilityId, input: {}, playbookStep: 0 }
      : undefined;
  }

  const parsed = resolveStepInput(def, candidate);
  if (parsed === "deferred") {
    return stepIndex === 0
      ? { capabilityId: def.capabilityId, input: {}, playbookStep: 0 }
      : undefined;
  }
  if (isPlanError(parsed)) return parsed;
  return stepIndex === 0
    ? { capabilityId: def.capabilityId, input: parsed, playbookStep: 0 }
    : undefined;
}

/** Pure — no DB / pg-boss. Validates the whole recipe; emits step 0 only. */
export function planPlaybook(
  playbook: PlaybookDef,
  seed: SeedValues
): PlaybookPlan | PlanError {
  const present = presentSeedKinds(seed);
  for (const kind of playbook.seedKinds) {
    if (!present.has(kind)) {
      return { kind: "missing_seed", seed: kind };
    }
  }

  const defs = playbook.steps.map(normalizePlaybookStep);
  const unknownCap = findUnknownCap(defs);
  if (unknownCap) return unknownCap;

  for (let i = 0; i < defs.length; i += 1) {
    const refErr = validateStepRefs(defs[i], i);
    if (refErr) return refErr;
  }

  const available = buildSeedAvailability(playbook, present);
  const candidate = seedValuesToCandidateInput(seed);
  let firstStep: PlannedStep | undefined;

  for (let i = 0; i < defs.length; i += 1) {
    const def = defs[i];
    const consumeErr = unsatisfiedConsumeError(def, available);
    if (consumeErr) return consumeErr;

    const stepResult = validateStepAtPlanTime(def, candidate, i);
    if (stepResult !== undefined) {
      if ("kind" in stepResult) return stepResult;
      firstStep = stepResult;
    }

    addProducesToAvailability(def, available);
  }

  if (!firstStep) {
    return {
      kind: "invalid_playbook",
      message: "Playbook has no insertable steps",
    };
  }

  return {
    playbookId: playbook.id,
    step: firstStep,
  };
}

function jobsAtStep(
  predecessors: readonly PredecessorJob[],
  step: number
): PredecessorJob[] {
  return predecessors.filter((p) => p.step === step);
}

function bagValues(job: PredecessorJob, bag: BindBag): string[] {
  return job.bags[bag] ?? [];
}

function resolveBindValue(
  bind: PlaybookStepBind,
  seed: SeedValues,
  predecessors: readonly PredecessorJob[]
): string | undefined {
  if ("seed" in bind) {
    const value = seedField(seed, bind.seed)?.trim();
    return value === "" ? undefined : value;
  }
  const jobs = jobsAtStep(predecessors, bind.step);
  const index = bind.index ?? 0;
  for (const job of jobs) {
    const values = bagValues(job, bind.bag);
    const hit = values[index];
    if (hit !== undefined && hit.trim() !== "") return hit;
  }
  return undefined;
}

export function materializeBoundInput(
  def: PlaybookStepDef,
  seed: SeedValues,
  predecessors: readonly PredecessorJob[]
): JsonObject | PlanError {
  const candidate = mergeJson(seedValuesToCandidateInput(seed), def.input);
  if (def.bind !== undefined) {
    for (const [field, bind] of Object.entries(def.bind)) {
      const value = resolveBindValue(bind, seed, predecessors);
      if (value !== undefined) candidate[field] = value;
    }
  }
  return parseCapInput(def.capabilityId, candidate);
}

const DEFAULT_FAN_MAX = 25;

export function materializeFanOutInputs(
  def: PlaybookStepDef,
  seed: SeedValues,
  predecessors: readonly PredecessorJob[]
): JsonObject[] | PlanError {
  const fanOut = def.fanOut;
  if (fanOut === undefined) {
    return {
      kind: "invalid_input",
      capabilityId: def.capabilityId,
      message: "fan-out step missing fanOut",
    };
  }
  const max = Math.min(fanOut.max ?? DEFAULT_FAN_MAX, DEFAULT_FAN_MAX);
  const seen = new Set<string>();
  const values: string[] = [];
  for (const job of jobsAtStep(predecessors, fanOut.from.step)) {
    for (const raw of bagValues(job, fanOut.from.bag)) {
      const value = raw.trim().toLowerCase();
      if (value === "" || seen.has(value)) continue;
      seen.add(value);
      values.push(raw.trim());
      if (values.length >= max) break;
    }
    if (values.length >= max) break;
  }

  const inputs: JsonObject[] = [];
  const base = mergeJson(seedValuesToCandidateInput(seed), def.input);
  for (const value of values) {
    const parsed = parseCapInput(def.capabilityId, {
      ...base,
      [fanOut.to]: value,
    });
    if (isPlanError(parsed)) return parsed;
    inputs.push(parsed);
  }
  return inputs;
}

export function derivePlaybookRequires(
  playbook: PlaybookDef
): PlaybookRequires {
  const credentials: CapDescriptorCredential[] = [];
  const flags = new Set<CapFlag>();
  let egress: CapEgress = "none";

  for (const id of playbookCapabilityIds(playbook)) {
    const desc = toCapDescriptor(requireCapability(id));
    if (desc.egress === "third_party") egress = "third_party";
    for (const f of desc.flags ?? []) flags.add(f);
    for (const c of desc.credentials ?? []) {
      const key = JSON.stringify(c);
      if (!credentials.some((x) => JSON.stringify(x) === key)) {
        credentials.push(c);
      }
    }
  }

  return {
    credentials,
    egress,
    flags: [...flags],
  };
}

export function toPlaybookDescriptor(
  playbook: PlaybookDef
): PlaybookDescriptor {
  return {
    id: playbook.id,
    title: playbook.title,
    description: playbook.description,
    seedKinds: [...playbook.seedKinds],
    steps: playbookCapabilityIds(playbook),
    requires: derivePlaybookRequires(playbook),
  };
}

export function checkPlaybookAvailability(
  requires: PlaybookRequires,
  opts: {
    hasCredential: (name: string) => boolean;
    allowThirdPartyEgress: boolean;
    thirdPartyCapabilityId?: string;
  }
): AvailabilityResult {
  if (requires.egress === "third_party" && !opts.allowThirdPartyEgress) {
    return {
      ok: false,
      kind: "egress_blocked",
      capabilityId: opts.thirdPartyCapabilityId ?? "(third_party)",
    };
  }
  for (const spec of requires.credentials) {
    if ("anyOf" in spec) {
      if (!spec.anyOf.some((n) => opts.hasCredential(n))) {
        return { ok: false, kind: "missing_credential", names: spec.anyOf };
      }
      continue;
    }
    if (spec.optional === true) continue;
    if (!opts.hasCredential(spec.name)) {
      return { ok: false, kind: "missing_credential", names: [spec.name] };
    }
  }
  return { ok: true };
}

/** Single-Cap availability — same predicate as playbooks, distinct entry point. */
export function checkCapabilityAvailability(
  requires: CapabilityRequires,
  opts: {
    hasCredential: (name: string) => boolean;
    allowThirdPartyEgress: boolean;
    thirdPartyCapabilityId?: string;
  }
): AvailabilityResult {
  return checkPlaybookAvailability(requires, opts);
}

export function formatPlanError(err: PlanError): string {
  switch (err.kind) {
    case "missing_seed": {
      return `Playbook requires seed.${err.seed === "evidence" ? "evidenceId" : err.seed}`;
    }
    case "unknown_cap": {
      return `Unknown Cap in playbook: ${err.capabilityId}`;
    }
    case "unsatisfied_step": {
      return `Playbook step ${err.capabilityId} consumes ${ioKey(err.needs)} which is not available from seed or prior steps`;
    }
    case "invalid_input": {
      return `Playbook step ${err.capabilityId}: invalid input — ${err.message}`;
    }
    case "invalid_playbook": {
      return err.message;
    }
    default: {
      const _exhaustive: never = err;
      return _exhaustive;
    }
  }
}
