import type { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import type { z } from "zod";

import type {
  EvidenceKind,
  EvidenceSnapshot,
  IdentifierType,
  JobHandoff,
  JsonValue,
  PatchOp,
} from "@watchdog/schemas";
import type { ToolsTag } from "@watchdog/tools";

export {
  type JsonObject,
  type PatchOp,
  type JobHandoff,
} from "@watchdog/schemas";
export interface CapArtifact {
  name: string;
  mime: string;
  uri: string;
  sha256: string;
}

export interface CapRunResult {
  artifacts: CapArtifact[];
}

/**
 * Cap.run requirements. Vault/blob I/O is on `CapContext` as Effects (`ToolsTag`).
 * Tools HTTP uses `HttpClient` from `toolsHttpClientLayer` (provided at Cap/job root).
 */
export type CapServices = HttpClient.HttpClient;

/** Cap collect/act body — Effect; interpret stays pure/sync. */
export type CapRun = Effect.Effect<CapRunResult, ToolsTag, CapServices>;

export interface CapInterpretResult {
  patch: PatchOp[];
  summary?: string;
  /**
   * When `jobPolicy.markEvidenceProcessed` is set: whether to stamp
   * Evidence.processedAt. `false` keeps Process available (e.g. attach Entity
   * and re-run). Omitted → mark only if a Proposal was created.
   */
  markSourceProcessed?: boolean;
}

/**
 * Plain data for pure `interpret(report, opts)` — no CapContext / I/O.
 * Core loads `report.json` and passes Job input (+ Process snapshot hints).
 */
export interface CapInterpretOpts<TInput> {
  input: TInput;
  /** Process: Entity from packed EvidenceSnapshot when Job.input omits it. */
  snapshotEntityId?: string;
  /** Process: snapshot text length — empty dumps must not lock Process. */
  snapshotTextChars?: number;
}

/**
 * Declarative hooks for the Job runner — keep Cap taxonomy out of executeJob.
 * Omit / empty = generic Cap (DNS/WHOIS-style).
 */
export interface CapJobPolicy {
  /** Pack EvidenceSnapshot into ctx before `run` (Process Caps). */
  needsEvidenceSnapshot?: boolean;
  /**
   * Input fields that identify Case Evidence to link on the Job
   * (and attach to Proposal ops). Tried in order; first string wins.
   */
  linkEvidenceFromInput?: readonly ("evidenceId" | "sourceEvidenceId")[];
  /**
   * After Job succeeds, maybe set Evidence.processedAt from `evidenceId`.
   * Honors `interpret.markSourceProcessed` when present; otherwise marks
   * only when a Proposal was created.
   */
  markEvidenceProcessed?: boolean;
  /**
   * Reuse prior Cap artifacts for identical input within this window.
   * Ignored when Cap `kind === "act"`.
   */
  cacheTtlMs?: number;
}

/**
 * Declared Cap secrets. Runner preflights before `run`:
 * - `{ name }` — required (fail closed if missing)
 * - `{ name, optional: true }` — present-or-skip
 * - `{ anyOf }` — at least one of the names must be set
 */
export type CapCredentialSpec =
  | { name: string; optional?: boolean }
  | { anyOf: readonly [string, ...string[]] };

export interface CapContext<TInput> {
  input: TInput;
  caseId: string;
  jobId: string;
  signal: AbortSignal;
  uploadArtifact: (input: {
    bytes: Uint8Array;
    mime: string;
    name?: string;
  }) => Effect.Effect<CapArtifact, ToolsTag>;
  readArtifact: (uri: string) => Effect.Effect<Uint8Array, ToolsTag>;
  scratchDir: string;
  getCredential: (name: string) => Effect.Effect<string, ToolsTag>;
  /** Presence check — does not decrypt. Use before selecting a provider. */
  hasCredential: (name: string) => Effect.Effect<boolean, ToolsTag>;
  /**
   * From Case.allowThirdPartyEgress — Caps check this before optional paid API
   * fallbacks. Cap-level `egress: "third_party"` is preflighted.
   */
  allowThirdPartyEgress: boolean;
  log: (message: string) => void;
  /** Packed by core when `jobPolicy.needsEvidenceSnapshot` — never live Graph. */
  evidenceSnapshot?: EvidenceSnapshot;
}

/** Whether Cap.run may send Case data to third-party APIs. Default `"none"`. */
export type CapEgress = "none" | "third_party";

/** Cap risk / role class — drives UI discoverability and cache eligibility. */
export type CapKind = "collect" | "enrich" | "process" | "act";

export type CapFlag = "needs_key" | "slow" | "invasive" | "third_party";

export type CapIoKind =
  | { kind: "identifier"; type: IdentifierType }
  | { kind: "evidence"; evidenceKind: EvidenceKind }
  | { kind: "host" }
  | { kind: "ip" }
  | { kind: "url" }
  | { kind: "hash" };

export interface CapabilityDef<TSchema extends z.ZodType> {
  id: string;
  title: string;
  description?: string;
  /** Descriptor version string; defaults to `"1"` in CapDescriptor. */
  version?: string;
  /** One-line provenance blurb for Jobs picker (e.g. "system resolver"). */
  dataSource?: string;
  /** Intent-pack labels for discoverability (e.g. "Passive", "Footprint"). */
  useCases?: readonly string[];
  /**
   * Input keys omitted from CapDescriptor.inputForm (Jobs Run field).
   * Defaults to `["entityId"]` — Entity picker owns that field.
   */
  formOmit?: readonly string[];
  input: TSchema;
  timeoutMs?: number;
  credentials?: readonly CapCredentialSpec[];
  /**
   * `"third_party"` Caps refuse to start unless Case.allowThirdPartyEgress.
   * Caps that only sometimes call a paid API leave
   * this as `"none"` and check `ctx.allowThirdPartyEgress` at the call site.
   */
  egress?: CapEgress;
  /** collect | enrich | process | act — act Caps are never result-cached. */
  kind?: CapKind;
  flags?: readonly CapFlag[];
  /** What this Cap accepts (for CapMatch / playbook handoffs). */
  consumes?: readonly CapIoKind[];
  /** What this Cap emits as artifacts / Proposal candidates. */
  produces?: readonly CapIoKind[];
  jobPolicy?: CapJobPolicy;
  run: (ctx: CapContext<z.infer<TSchema>>) => CapRun;
  /**
   * Pure Proposal mapping — report JSON only (no ctx / network / DB).
   * Core loads `report.json` before calling.
   */
  interpret?: (
    report: JsonValue,
    opts: CapInterpretOpts<z.infer<TSchema>>
  ) => CapInterpretResult;
  /**
   * Pure bags for playbook bind/fan-out. Core persists on Job.handoff at
   * success (including cache hits). Independent of `produces`.
   */
  handoff?: (report: JsonValue) => JobHandoff | undefined;
}

export function defineCapability<TSchema extends z.ZodType>(
  def: CapabilityDef<TSchema>
): CapabilityDef<TSchema> {
  if (!def.id.trim()) throw new Error("Capability id is required");
  if (!def.title.trim()) throw new Error("Capability title is required");
  return def;
}

/** Fallback Cap abort window when `timeoutMs` is omitted on the Cap. */
export const DEFAULT_CAP_TIMEOUT_MS = 120_000;

/** Effective Cap abort timeout (explicit or default). */
export function capTimeoutMs(cap: { timeoutMs?: number }): number {
  return cap.timeoutMs ?? DEFAULT_CAP_TIMEOUT_MS;
}
