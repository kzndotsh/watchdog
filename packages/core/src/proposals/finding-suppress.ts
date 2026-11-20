import { Effect } from "effect";

import type { DbExec, DbTx } from "@watchdog/db";
import {
  edgePatchFingerprintKey,
  fingerprintPatchOp,
  isPatchOpOf,
  normalizeIdentifierValue,
  patchOpRelatedEntityIds,
  type PatchOp,
  type PatchOpOf,
} from "@watchdog/schemas/graph";
import {
  normalizeIdentifierPlatform,
  normalizeUuidList,
  type CaseId,
} from "@watchdog/schemas/shared";

import type { DomainTag } from "../errors/tagged-errors";
import type { Db } from "../infra/db-service";
import { onExec } from "../infra/repo-fx";
import {
  identifiersRepoFx,
  claimsRepoFx,
  edgesRepoFx,
  questionsRepoFx,
  entitiesRepoFx,
  findingSuppressionsRepoFx,
  proposalsRepoFx,
} from "../infra/repos-fx";

type Fingerprinted<T extends PatchOp = PatchOp> = { op: T; fp: string };

/** The entity ids a group of ops is about (their `entityId`), once each. */
function entityIdsOf(
  items: readonly Fingerprinted<
    PatchOpOf<"identifier" | "claim" | "question">
  >[]
): string[] {
  return normalizeUuidList(items.map((x) => x.op.data.entityId));
}

/** Text keys (`entity\0lowercased text`) of a Claim or Question op. */
function textKey(op: PatchOpOf<"claim" | "question">): string {
  return `${op.data.entityId}\0${op.data.text.toLowerCase()}`;
}

function markExistingInGraphEffect(
  exec: DbExec | undefined,
  caseId: CaseId,
  fps: Fingerprinted[],
  known: Set<string>
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* markExistingInGraphGen() {
    const unchecked = fps.filter((x) => !known.has(x.fp));
    if (unchecked.length === 0) {
      return;
    }

    const identifierOps: Fingerprinted<PatchOpOf<"identifier">>[] = [];
    const claimOps: Fingerprinted<PatchOpOf<"claim">>[] = [];
    const edgeOps: Fingerprinted<PatchOpOf<"edge">>[] = [];
    const questionOps: Fingerprinted<PatchOpOf<"question">>[] = [];
    const entityOps: Fingerprinted<PatchOpOf<"entity">>[] = [];
    for (const { op, fp } of unchecked) {
      if (isPatchOpOf(op, "identifier")) identifierOps.push({ op, fp });
      else if (isPatchOpOf(op, "claim")) claimOps.push({ op, fp });
      else if (isPatchOpOf(op, "edge")) edgeOps.push({ op, fp });
      else if (isPatchOpOf(op, "question")) questionOps.push({ op, fp });
      else if (isPatchOpOf(op, "entity")) entityOps.push({ op, fp });
    }

    if (identifierOps.length > 0) {
      const rows = yield* onExec(exec, (handle) =>
        identifiersRepoFx.listNaturalKeysInCase(
          handle,
          caseId,
          entityIdsOf(identifierOps)
        )
      );
      const keys = new Set(
        rows.map((r) => `${r.entityId}\0${r.type}\0${r.platform}\0${r.value}`)
      );
      for (const { op, fp } of identifierOps) {
        const { entityId, type } = op.data;
        const platform = normalizeIdentifierPlatform(op.data.platform ?? "");
        const value = normalizeIdentifierValue(type, op.data.value);
        if (keys.has(`${entityId}\0${type}\0${platform}\0${value}`)) {
          known.add(fp);
        }
      }
    }

    if (claimOps.length > 0) {
      const rows = yield* onExec(exec, (handle) =>
        claimsRepoFx.listTextKeysInCase(handle, caseId, entityIdsOf(claimOps))
      );
      const keys = new Set(
        rows.map((r) => `${r.entityId}\0${r.text.toLowerCase()}`)
      );
      for (const { op, fp } of claimOps) {
        if (keys.has(textKey(op))) known.add(fp);
      }
    }

    if (edgeOps.length > 0) {
      const rows = yield* onExec(exec, (handle) =>
        edgesRepoFx.listNaturalKeysInCase(
          handle,
          caseId,
          normalizeUuidList(
            edgeOps.flatMap((x) => patchOpRelatedEntityIds(x.op))
          )
        )
      );
      const keys = new Set(
        rows
          .map((row) =>
            edgePatchFingerprintKey({
              fromId: row.fromId,
              toId: row.toId,
              predicate: row.predicate,
              notes: row.notes,
            })
          )
          .filter((key): key is string => key !== null)
      );
      for (const { op, fp } of edgeOps) {
        const key = edgePatchFingerprintKey(op.data);
        if (key !== null && keys.has(key)) known.add(fp);
      }
    }

    if (questionOps.length > 0) {
      const rows = yield* onExec(exec, (handle) =>
        questionsRepoFx.listTextKeysInCase(
          handle,
          caseId,
          entityIdsOf(questionOps)
        )
      );
      const keys = new Set(
        rows.map((r) => `${r.entityId}\0${r.text.toLowerCase()}`)
      );
      for (const { op, fp } of questionOps) {
        if (keys.has(textKey(op))) known.add(fp);
      }
    }

    const sluggedOps = entityOps.flatMap(({ op, fp }) =>
      op.kind === "entity.update" ? [] : [{ slug: op.data.slug, fp }]
    );
    if (sluggedOps.length > 0) {
      const rows = yield* onExec(exec, (handle) =>
        entitiesRepoFx.listSlugsInCase(handle, caseId, [
          ...new Set(sluggedOps.map((x) => x.slug)),
        ])
      );
      const keys = new Set(rows.map((r) => r.slug));
      for (const { slug, fp } of sluggedOps) {
        if (keys.has(slug)) known.add(fp);
      }
    }
  });
}

/**
 * Drop ops whose fingerprint already exists in the Graph, a pending Proposal,
 * or finding_suppressions (rejected FP memory).
 */
export function suppressKnownFindingsEffect(
  caseId: CaseId,
  patch: PatchOp[],
  exec?: DbExec
): Effect.Effect<{ kept: PatchOp[]; suppressed: number }, DomainTag, Db> {
  if (patch.length === 0) {
    return Effect.succeed({ kept: [], suppressed: 0 });
  }

  return Effect.gen(function* suppressKnownFindingsGen() {
    const fps = patch.map((op) => ({
      op,
      fp: fingerprintPatchOp(op),
    }));

    const known = new Set<string>();

    const fpList = fps.flatMap((x) => (x.fp ? [x.fp] : []));
    if (fpList.length > 0) {
      const fingerprints = yield* onExec(exec, (handle) =>
        findingSuppressionsRepoFx.listFingerprints(handle, caseId, fpList)
      );
      for (const fp of fingerprints) known.add(fp);
    }

    const pending = yield* onExec(exec, (handle) =>
      proposalsRepoFx.listPendingPatches(handle, caseId)
    );
    for (const row of pending) {
      for (const op of row.patch) {
        const fp = fingerprintPatchOp(op);
        if (fp !== null) known.add(fp);
      }
    }

    yield* markExistingInGraphEffect(
      exec,
      caseId,
      fps.filter((x): x is Fingerprinted => Boolean(x.fp)),
      known
    );

    const kept: PatchOp[] = [];
    let suppressed = 0;
    for (const { op, fp } of fps) {
      if (fp !== null && known.has(fp)) {
        suppressed += 1;
        continue;
      }
      kept.push(op);
    }
    return { kept, suppressed };
  });
}

export function recordRejectedFingerprintsEffect(input: {
  caseId: CaseId;
  proposalId: string;
  patch: PatchOp[];
  tx?: DbTx;
}): Effect.Effect<void, DomainTag, Db> {
  const rows = input.patch
    .map((op) => fingerprintPatchOp(op))
    .filter((fp): fp is string => Boolean(fp))
    .map((fingerprint) => ({
      caseId: input.caseId,
      fingerprint,
      reason: "rejected",
      proposalId: input.proposalId,
    }));
  if (rows.length === 0) return Effect.void;
  return onExec(input.tx, (exec) =>
    findingSuppressionsRepoFx.insertMany(exec, rows)
  ).pipe(Effect.asVoid);
}
