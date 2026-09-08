import {
  claimsRepo,
  db,
  edgesRepo,
  entitiesRepo,
  findingSuppressionsRepo,
  identifiersRepo,
  proposalsRepo,
  questionsRepo,
  type DbExec,
  type DbTx,
} from "@watchdog/db";
import { isOneOf } from "@watchdog/policy";
import {
  IDENTIFIER_TYPES,
  edgePatchFingerprintKey,
  fingerprintPatchOp,
  normalizeUuidList,
  normalizeIdentifierPlatform,
  normalizeIdentifierTypeInput,
  normalizeIdentifierValue,
  patchOpEntityId,
  patchOpRelatedEntityIds,
  parseTrimmedCaseId,
  slugifyName,
  trimmedOrUndefined,
  type PatchOp,
} from "@watchdog/schemas";

function markExistingInGraph(
  exec: DbExec,
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
      const entityIds = normalizeUuidList(
        identifierOps.flatMap((x) => {
          const entityId = patchOpEntityId(x.op);
          return entityId === undefined ? [] : [entityId];
        })
      );
      if (entityIds.length > 0) {
        const rows = await identifiersRepo.listNaturalKeysInCase(
          exec,
          caseId,
          entityIds
        );
        const keys = new Set(
          rows.map((r) => `${r.entityId}\0${r.type}\0${r.platform}\0${r.value}`)
        );
        for (const { op, fp } of identifierOps) {
          const d = op.data;
          const entityId = patchOpEntityId(op);
          const typeRaw =
            typeof d.type === "string"
              ? normalizeIdentifierTypeInput(d.type)
              : undefined;
          const valueRaw =
            typeof d.value === "string"
              ? trimmedOrUndefined(d.value)
              : undefined;
          if (
            entityId === undefined ||
            typeRaw === undefined ||
            typeRaw === "" ||
            valueRaw === undefined
          )
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
      const entityIds = normalizeUuidList(
        claimOps.flatMap((x) => {
          const entityId = patchOpEntityId(x.op);
          return entityId === undefined ? [] : [entityId];
        })
      );
      if (entityIds.length > 0) {
        const rows = await claimsRepo.listTextKeysInCase(
          exec,
          caseId,
          entityIds
        );
        const keys = new Set(
          rows.map((r) => `${r.entityId}\0${r.text.toLowerCase()}`)
        );
        for (const { op, fp } of claimOps) {
          const entityId = patchOpEntityId(op);
          const text =
            typeof op.data.text === "string"
              ? (trimmedOrUndefined(op.data.text)?.toLowerCase() ?? null)
              : null;
          if (
            entityId !== undefined &&
            text !== null &&
            keys.has(`${entityId}\0${text}`)
          ) {
            known.add(fp);
          }
        }
      }
    }

    if (edgeOps.length > 0) {
      const entityIds = normalizeUuidList(
        edgeOps.flatMap((x) => patchOpRelatedEntityIds(x.op))
      );
      if (entityIds.length > 0) {
        const rows = await edgesRepo.listNaturalKeysInCase(
          exec,
          caseId,
          entityIds
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
          const key = edgePatchFingerprintKey({
            fromId:
              typeof op.data.fromId === "string"
                ? (parseTrimmedCaseId(op.data.fromId) ?? "")
                : "",
            toId:
              typeof op.data.toId === "string"
                ? (parseTrimmedCaseId(op.data.toId) ?? "")
                : "",
            predicate:
              typeof op.data.predicate === "string"
                ? (trimmedOrUndefined(op.data.predicate) ?? "")
                : "",
            notes: op.data.notes,
          });
          if (key !== null && keys.has(key)) known.add(fp);
        }
      }
    }

    if (questionOps.length > 0) {
      const entityIds = normalizeUuidList(
        questionOps.flatMap((x) => {
          const entityId = patchOpEntityId(x.op);
          return entityId === undefined ? [] : [entityId];
        })
      );
      if (entityIds.length > 0) {
        const rows = await questionsRepo.listTextKeysInCase(
          exec,
          caseId,
          entityIds
        );
        const keys = new Set(
          rows.map((r) => `${r.entityId}\0${r.text.toLowerCase()}`)
        );
        for (const { op, fp } of questionOps) {
          const entityId = patchOpEntityId(op);
          const text =
            typeof op.data.text === "string"
              ? (trimmedOrUndefined(op.data.text)?.toLowerCase() ?? null)
              : null;
          if (
            entityId !== undefined &&
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
              typeof x.op.data.slug === "string"
                ? slugifyName(x.op.data.slug)
                : null
            )
            .filter((s): s is string => s !== "")
        ),
      ];
      if (slugs.length > 0) {
        const rows = await entitiesRepo.listSlugsInCase(exec, caseId, slugs);
        const keys = new Set(rows.map((r) => r.slug));
        for (const { op, fp } of entityOps) {
          const slug =
            typeof op.data.slug === "string" ? slugifyName(op.data.slug) : "";
          if (slug !== "" && keys.has(slug)) known.add(fp);
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
  patch: PatchOp[],
  exec: DbExec = db
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
        exec,
        caseId,
        fpList
      );
      for (const fp of fingerprints) known.add(fp);
    }

    // Pending proposals
    const pending = await proposalsRepo.listPendingPatches(exec, caseId);
    for (const row of pending) {
      for (const op of row.patch) {
        const fp = fingerprintPatchOp(op);
        if (fp !== null) known.add(fp);
      }
    }

    // Graph existence
    await markExistingInGraph(
      exec,
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
