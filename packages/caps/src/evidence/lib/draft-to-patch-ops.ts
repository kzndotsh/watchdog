import { randomUUID } from "node:crypto";

import { isEmptyDraft, type ProcessExtractDraft } from "@watchdog/ai";
import {
  normalizeIdentifierPlatform,
  normalizeIdentifierValue,
  parseTrimmedCaseId,
  trimmedOrUndefined,
  validateIdentifierWrite,
  type IdentifierType,
  type PatchOp,
} from "@watchdog/schemas";

import { eligibleCtDomains } from "../../lib/collect/eligible-domain-hosts";
import {
  INVALID_COLLECT_ENTITY_SUMMARY,
  resolveCollectEntityId,
} from "../../lib/collect/resolve-collect-entity-id";

export interface DraftToPatchOpsCtx {
  evidenceId: string;
  entityId?: string;
}

interface NormalizedDraftCtx {
  evidenceId: string;
  entityId: string;
}

type DraftCtxIssue = "missing_entity" | "invalid_entity" | "invalid_evidence";

type NormalizeDraftCtxResult =
  | { ok: true; ctx: NormalizedDraftCtx }
  | { ok: false; issue: DraftCtxIssue };

function normalizeDraftCtx(ctx: DraftToPatchOpsCtx): NormalizeDraftCtxResult {
  const evidenceId = parseTrimmedCaseId(ctx.evidenceId);
  if (evidenceId === null) {
    return { ok: false, issue: "invalid_evidence" };
  }
  const entityResolved = resolveCollectEntityId(ctx.entityId);
  if (entityResolved === null) {
    return { ok: false, issue: "invalid_entity" };
  }
  if (entityResolved === undefined) {
    return { ok: false, issue: "missing_entity" };
  }
  return { ok: true, ctx: { evidenceId, entityId: entityResolved } };
}

function draftCtxError(
  issue: Exclude<DraftCtxIssue, "missing_entity">
): string {
  return issue === "invalid_entity"
    ? INVALID_COLLECT_ENTITY_SUMMARY
    : "Evidence id is not a valid UUID";
}

function textWithQuote(text: string, evidenceQuote?: string): string {
  const quote = trimmedOrUndefined(evidenceQuote);
  if (quote !== undefined) {
    return `${text} (“${quote}”)`;
  }
  return text;
}

function identifierNotes(
  notes: string | undefined,
  evidenceQuote: string | undefined
): string {
  const trimmedNotes = trimmedOrUndefined(notes);
  const trimmedQuote = trimmedOrUndefined(evidenceQuote);
  return [trimmedNotes, trimmedQuote ? `quote: ${trimmedQuote}` : null]
    .filter(Boolean)
    .join(" | ");
}

function identifierValueForDraft(
  type: IdentifierType,
  raw: string
): string | null {
  if (type === "domain") {
    const [host] = eligibleCtDomains([raw]);
    return host ?? null;
  }
  return normalizeIdentifierValue(type, raw);
}

function identifierToPatchOp(
  id: ProcessExtractDraft["identifiers"][number],
  entityId: string,
  evidenceIds: string[]
): PatchOp | null {
  const notesParts = identifierNotes(id.notes, id.evidenceQuote);
  const platform = normalizeIdentifierPlatform(
    trimmedOrUndefined(id.platform) ?? ""
  );
  const value = identifierValueForDraft(id.type, id.value);
  if (value === null) return null;
  const written = validateIdentifierWrite({
    type: id.type,
    value,
    platform,
  });
  if (!written.ok) return null;
  return {
    op: "create",
    resource: "identifier",
    id: randomUUID(),
    evidenceIds,
    data: {
      entityId,
      type: written.type,
      value: written.value,
      platform: written.platform,
      ...(id.status ? { status: id.status } : {}),
      ...(notesParts ? { notes: notesParts } : {}),
    },
  };
}

function claimToPatchOp(
  claim: ProcessExtractDraft["claims"][number],
  entityId: string,
  evidenceIds: string[]
): PatchOp | null {
  const text = trimmedOrUndefined(claim.text);
  if (text === undefined) return null;
  return {
    op: "create",
    resource: "claim",
    id: randomUUID(),
    evidenceIds,
    data: {
      entityId,
      text: textWithQuote(text, claim.evidenceQuote),
      class: claim.class ?? "observation",
    },
  };
}

function questionToPatchOp(
  question: ProcessExtractDraft["questions"][number],
  entityId: string,
  evidenceIds: string[]
): PatchOp | null {
  const text = trimmedOrUndefined(question.text);
  if (text === undefined) return null;
  return {
    op: "create",
    resource: "question",
    id: randomUUID(),
    evidenceIds,
    data: {
      entityId,
      text: textWithQuote(text, question.evidenceQuote),
    },
  };
}

/**
 * Pure mapper: ProcessExtractDraft → PatchOp[].
 * Strips any smuggled confidence; attaches source evidenceId.
 * Without entityId, returns [] (identifiers/claims/questions need a parent Entity).
 */
export function draftToPatchOps(
  draft: ProcessExtractDraft,
  ctx: DraftToPatchOpsCtx
): PatchOp[] {
  if (isEmptyDraft(draft)) return [];
  const normalized = normalizeDraftCtx(ctx);
  if (!normalized.ok) {
    if (normalized.issue === "missing_entity") return [];
    throw new Error(draftCtxError(normalized.issue));
  }

  const { entityId, evidenceId } = normalized.ctx;
  const evidenceIds = [evidenceId];
  return [
    ...draft.identifiers
      .map((id) => identifierToPatchOp(id, entityId, evidenceIds))
      .filter((op): op is PatchOp => op !== null),
    ...draft.claims
      .map((claim) => claimToPatchOp(claim, entityId, evidenceIds))
      .filter((op): op is PatchOp => op !== null),
    ...draft.questions
      .map((q) => questionToPatchOp(q, entityId, evidenceIds))
      .filter((op): op is PatchOp => op !== null),
  ];
}

export type ProcessCapOutcome =
  | { kind: "empty"; reason: "no_signal" | "no_entity" }
  | { kind: "proposal"; patch: PatchOp[]; summary: string }
  | { kind: "failed"; error: string };

export function draftToOutcome(
  draft: ProcessExtractDraft,
  ctx: DraftToPatchOpsCtx
): ProcessCapOutcome {
  if (isEmptyDraft(draft)) {
    return { kind: "empty", reason: "no_signal" };
  }
  const normalized = normalizeDraftCtx(ctx);
  if (!normalized.ok) {
    if (normalized.issue === "missing_entity") {
      return { kind: "empty", reason: "no_entity" };
    }
    return { kind: "failed", error: draftCtxError(normalized.issue) };
  }
  const patch = draftToPatchOps(draft, normalized.ctx);
  if (patch.length === 0) {
    return { kind: "empty", reason: "no_signal" };
  }
  const summary =
    trimmedOrUndefined(draft.summary) ??
    `Process extract: ${draft.identifiers.length} id(s), ${draft.claims.length} claim(s), ${draft.questions.length} question(s)`;
  return { kind: "proposal", patch, summary };
}
