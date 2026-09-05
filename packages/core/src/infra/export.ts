import { Effect } from "effect";
/**
 * export.ts — Render an Entity (and its full graph data) as an Obsidian-style
 * markdown note matching the locked Export format from the greenfield plan.
 *
 * Note anatomy:
 *   YAML frontmatter → Connections → Identifiers → Summary → Claims →
 *   Timeline → Questions → Notes → Evidence
 */

import {
  casesRepo,
  claimsRepo,
  db,
  edgesRepo,
  entitiesRepo,
  eventsRepo,
  evidenceRepo,
  identifiersRepo,
  questionsRepo,
  type EvidenceRow,
  type EntityPeerRow,
} from "@watchdog/db";
import type { EntityKind } from "@watchdog/schemas";

import {
  appendClaimsSection,
  appendConnectionsSection,
  appendEvidenceSection,
  appendIdentifiersSection,
  appendOptionalTextSection,
  appendQuestionsSection,
  appendTimelineSection,
  buildAttestationsMarkdown,
  buildCaseMarkdown,
  buildEntityFrontmatter,
  isAttestationExportRow,
} from "./export-sections";
import { tryDb } from "./postgres-effect";
import { toDomainError } from "./tagged-errors";

export interface EntityExport {
  caseSlug: string;
  entitySlug: string;
  kind: EntityKind;
  markdown: string;
}

/**
 * Fetch all data for an entity and render it as a markdown note.
 * Pass `peerMap` when exporting a whole Case to avoid re-scanning peers.
 */
export function renderEntityMarkdownEffect(
  entityId: string,
  peerMap?: Map<string, EntityPeerRow>
): Effect.Effect<EntityExport | null> {
  return Effect.gen(function* renderEntityMarkdownGen() {
    const row = yield* tryDb(() => entitiesRepo.getWithCase(db, entityId));
    if (!row) return null;

    const [
      entityClaims,
      entityIdentifiers,
      outEdges,
      entityEvents,
      entityQuestions,
      entityEvidence,
      peers,
    ] = yield* Effect.all(
      [
        tryDb(() => claimsRepo.listForEntity(db, entityId)),
        tryDb(() => identifiersRepo.listForEntity(db, entityId)),
        tryDb(() => edgesRepo.listOutboundForEntity(db, entityId)),
        tryDb(() => eventsRepo.listForEntity(db, entityId)),
        tryDb(() => questionsRepo.listForEntity(db, entityId)),
        tryDb(() => evidenceRepo.listForEntity(db, row.caseId, entityId)),
        peerMap
          ? Effect.succeed([] as EntityPeerRow[])
          : tryDb(() => entitiesRepo.listPeersForCase(db, row.caseId)),
      ],
      { concurrency: "unbounded" }
    );

    const resolvedPeers =
      peerMap ?? new Map(peers.map((e) => [e.id, e] as const));

    const lines: string[] = [
      buildEntityFrontmatter({
        kind: row.kind,
        caseSlug: row.caseSlug,
        entityId: row.id,
      }),
      `# ${row.name}`,
      "",
    ];

    appendConnectionsSection(lines, outEdges, resolvedPeers);
    appendIdentifiersSection(lines, entityIdentifiers);
    appendOptionalTextSection(lines, "## Summary", row.summary);
    appendClaimsSection(lines, entityClaims);
    appendTimelineSection(lines, entityEvents);
    appendQuestionsSection(lines, entityQuestions);
    appendOptionalTextSection(lines, "## Notes", row.notes);
    appendEvidenceSection(lines, entityEvidence);

    return {
      caseSlug: row.caseSlug,
      entitySlug: row.slug,
      kind: row.kind,
      markdown: `${lines.join("\n").trimEnd()}\n`,
    };
  }).pipe(Effect.mapError(toDomainError), Effect.orDie);
}

interface CaseExportResult {
  files: Map<string, string>;
  evidenceRows: EvidenceRow[];
}

/**
 * Render all entities in a Case and return them as a map of
 * `kind/slug` → markdown string.
 * Also includes evidence file references in CASE.md.
 */
export function renderCaseExportEffect(
  caseId: string
): Effect.Effect<CaseExportResult> {
  return Effect.gen(function* renderCaseExportGen() {
    const entityRows = yield* tryDb(() =>
      entitiesRepo.listPeersForCase(db, caseId)
    );
    const peerMap = new Map(entityRows.map((e) => [e.id, e]));
    const mdFiles = new Map<string, string>();

    const exportedEntities = yield* Effect.forEach(
      entityRows,
      ({ id }) => renderEntityMarkdownEffect(id, peerMap),
      { concurrency: "unbounded" }
    );
    for (const exported of exportedEntities) {
      if (exported) {
        mdFiles.set(
          `${exported.kind}s/${exported.entitySlug}.md`,
          exported.markdown
        );
      }
    }

    const evidenceRows = yield* tryDb(() =>
      evidenceRepo.listActiveForCaseAsc(db, caseId)
    );
    const caseRow = yield* tryDb(() => casesRepo.getByIdUnchecked(db, caseId));

    if (caseRow) {
      const attestations = evidenceRows.filter(isAttestationExportRow);

      mdFiles.set(
        "CASE.md",
        buildCaseMarkdown(caseRow, mdFiles, evidenceRows.length)
      );

      if (attestations.length > 0) {
        mdFiles.set(
          "evidence/attestations.md",
          buildAttestationsMarkdown(caseRow.slug, attestations)
        );
      }
    }

    return { files: mdFiles, evidenceRows };
  }).pipe(Effect.mapError(toDomainError), Effect.orDie);
}
