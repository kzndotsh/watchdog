import {
  claimsRepo,
  db,
  edgesRepo,
  entitiesRepo,
  findingSuppressionsRepo,
  identifiersRepo,
  proposalsRepo,
  questionsRepo,
  type DbTx,
} from "@watchdog/db";
import { isOneOf } from "@watchdog/policy";
import {
  EDGE_PREDICATES,
  IDENTIFIER_TYPES,
  fingerprintPatchOp,
  normalizeIdentifierPlatform,
  normalizeIdentifierValue,
  type PatchOp,
} from "@watchdog/schemas";

function markExistingInGraph(
  caseId: string,
  fps: { op: PatchOp; fp: string }[],
  known: Set<string>
): Promise<void> {
  return (async () => {
    const unchecked = fps.filter((x) => !known.has(x.fp));
    if (unchecked.length === 0) {
      return;
    }

    const identifierOps: { op: PatchOp; fp: string }[] = [];
    const claimOps: { op: PatchOp; fp: string }[] = [];
    const edgeOps: { op: PatchOp; fp: string }[] = [];
    const questionOps: { op: PatchOp; fp: string }[] = [];
    const entityOps: { op: PatchOp; fp: string }[] = [];
    for (const item of unchecked) {
      switch (item.op.resource) {
        case "identifier": {
          identifierOps.push(item);
          break;
        }
        case "claim": {
          claimOps.push(item);
          break;
        }
        case "edge": {
          edgeOps.push(item);
          break;
        }
        case "question": {
          questionOps.push(item);
          break;
        }
        case "entity": {
          entityOps.push(item);
          break;
        }
        case "event": {
          break;
        }
        default: {
          item.op.resource satisfies never;
        }
      }
    }

    if (identifierOps.length > 0) {
      const entityIds = [
        ...new Set(
          identifierOps
            .map((x) => x.op.data.entityId)
            .filter((id): id is string => typeof id === "string")
        ),
      ];
      if (entityIds.length > 0) {
        const rows = await identifiersRepo.listNaturalKeysInCase(
          db,
          caseId,
          entityIds
        );
        const keys = new Set(
          rows.map((r) => `${r.entityId}\0${r.type}\0${r.platform}\0${r.value}`)
        );
        for (const { op, fp } of identifierOps) {
          const d = op.data;
          const entityId = typeof d.entityId === "string" ? d.entityId : null;
          const typeRaw = typeof d.type === "string" ? d.type : null;
          const valueRaw = typeof d.value === "string" ? d.value : null;
          if (entityId === null || typeRaw === null || valueRaw === null)
            continue;
          if (!isOneOf(typeRaw, IDENTIFIER_TYPES)) continue;
          const type = typeRaw;
          const platform =
            typeof d.platform === "string"
              ? normalizeIdentifierPlatform(d.platform)
              : "";
          const value = normalizeIdentifierValue(type, valueRaw);
          if (keys.has(`${entityId}\0${type}\0${platform}\0${value}`)) {
            known.add(fp);
          }
        }
      }
    }

    if (claimOps.length > 0) {
      const entityIds = [
        ...new Set(
          claimOps
            .map((x) => x.op.data.entityId)
            .filter((id): id is string => typeof id === "string")
        ),
      ];
      if (entityIds.length > 0) {
        const rows = await claimsRepo.listTextKeysInCase(db, caseId, entityIds);
        const keys = new Set(rows.map((r) => `${r.entityId}\0${r.text}`));
        for (const { op, fp } of claimOps) {
          const entityId =
            typeof op.data.entityId === "string" ? op.data.entityId : null;
          const text =
            typeof op.data.text === "string" ? op.data.text.trim() : null;
          if (
            entityId !== null &&
            text !== null &&
            keys.has(`${entityId}\0${text}`)
          ) {
            known.add(fp);
          }
        }
      }
    }

    if (edgeOps.length > 0) {
      const fromIds = [
        ...new Set(
          edgeOps
            .map((x) => x.op.data.fromId)
            .filter((id): id is string => typeof id === "string")
        ),
      ];
      if (fromIds.length > 0) {
        const rows = await edgesRepo.listNaturalKeysInCase(db, caseId, fromIds);
        const keys = new Set(
          rows.map((r) => `${r.fromId}\0${r.toId}\0${r.predicate}`)
        );
        for (const { op, fp } of edgeOps) {
          const fromId =
            typeof op.data.fromId === "string" ? op.data.fromId : null;
          const toId = typeof op.data.toId === "string" ? op.data.toId : null;
          const predicateRaw =
            typeof op.data.predicate === "string" ? op.data.predicate : null;
          if (fromId === null || toId === null || predicateRaw === null)
            continue;
          if (!isOneOf(predicateRaw, EDGE_PREDICATES)) {
            continue;
          }
          if (keys.has(`${fromId}\0${toId}\0${predicateRaw}`)) known.add(fp);
        }
      }
    }

    if (questionOps.length > 0) {
      const entityIds = [
        ...new Set(
          questionOps
            .map((x) => x.op.data.entityId)
            .filter((id): id is string => typeof id === "string")
        ),
      ];
      if (entityIds.length > 0) {
        const rows = await questionsRepo.listTextKeysInCase(
          db,
          caseId,
          entityIds
        );
        const keys = new Set(rows.map((r) => `${r.entityId}\0${r.text}`));
        for (const { op, fp } of questionOps) {
          const entityId =
            typeof op.data.entityId === "string" ? op.data.entityId : null;
          const text =
            typeof op.data.text === "string" ? op.data.text.trim() : null;
          if (
            entityId !== null &&
            text !== null &&
            keys.has(`${entityId}\0${text}`)
          ) {
            known.add(fp);
          }
        }
      }
    }

    if (entityOps.length > 0) {
      const slugs = [
        ...new Set(
          entityOps
            .map((x) =>
              typeof x.op.data.slug === "string" ? x.op.data.slug.trim() : null
            )
            .filter((s): s is string => Boolean(s))
        ),
      ];
      if (slugs.length > 0) {
        const rows = await entitiesRepo.listSlugsInCase(db, caseId, slugs);
        const keys = new Set(rows.map((r) => r.slug));
        for (const { op, fp } of entityOps) {
          const slug =
            typeof op.data.slug === "string" ? op.data.slug.trim() : null;
          if (slug !== null && keys.has(slug)) known.add(fp);
        }
      }
    }
  })();
}

/**
 * Drop ops whose fingerprint already exists in the Graph, a pending Proposal,
 * or finding_suppressions (rejected FP memory).
 */
export function suppressKnownFindings(
  caseId: string,
  patch: PatchOp[]
): Promise<{ kept: PatchOp[]; suppressed: number }> {
  if (patch.length === 0) {
    return Promise.resolve({ kept: [], suppressed: 0 });
  }

  return (async () => {
    const fps = patch.map((op) => ({
      op,
      fp: fingerprintPatchOp(op),
    }));

    const known = new Set<string>();

    // Rejected / suppressed memory
    const fpList = fps.map((x) => x.fp).filter((x): x is string => Boolean(x));
    if (fpList.length > 0) {
      const fingerprints = await findingSuppressionsRepo.listFingerprints(
        db,
        caseId,
        fpList
      );
      for (const fp of fingerprints) known.add(fp);
    }

    // Pending proposals
    const pending = await proposalsRepo.listPendingPatches(db, caseId);
    for (const row of pending) {
      for (const op of row.patch) {
        const fp = fingerprintPatchOp(op);
        if (fp !== null) known.add(fp);
      }
    }

    // Graph existence
    await markExistingInGraph(
      caseId,
      fps.filter((x): x is { op: PatchOp; fp: string } => Boolean(x.fp)),
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
  })();
}

export function recordRejectedFingerprints(input: {
  caseId: string;
  proposalId: string;
  patch: PatchOp[];
  tx?: DbTx;
}): Promise<void> {
  const rows = input.patch
    .map((op) => fingerprintPatchOp(op))
    .filter((fp): fp is string => Boolean(fp))
    .map((fingerprint) => ({
      caseId: input.caseId,
      fingerprint,
      reason: "rejected",
      proposalId: input.proposalId,
    }));
  if (rows.length === 0) return Promise.resolve();
  const exec = input.tx ?? db;
  return findingSuppressionsRepo.insertMany(exec, rows).then(() => {});
}
