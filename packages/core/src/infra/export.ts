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
import { entityDisplayLabel, parseTrimmedCaseId } from "@watchdog/schemas";

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
import type { DomainTag } from "./tagged-errors";

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
): Effect.Effect<EntityExport | null, DomainTag> {
  return Effect.gen(function* renderEntityMarkdownGen() {
    const normalizedEntityId = parseTrimmedCaseId(entityId) ?? undefined;
    if (normalizedEntityId === undefined) return null;

    const row = yield* tryDb(() =>
      entitiesRepo.getWithCase(db, normalizedEntityId)
    );
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
        tryDb(() => claimsRepo.listForEntity(db, normalizedEntityId)),
        tryDb(() => identifiersRepo.listForEntity(db, normalizedEntityId)),
        tryDb(() =>
          edgesRepo.listOutboundForEntity(db, row.caseId, normalizedEntityId)
        ),
        tryDb(() => eventsRepo.listForEntity(db, normalizedEntityId)),
        tryDb(() => questionsRepo.listForEntity(db, normalizedEntityId)),
        tryDb(() =>
          evidenceRepo.listForEntity(db, row.caseId, normalizedEntityId)
        ),
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
      `# ${entityDisplayLabel({ name: row.name, slug: row.slug })}`,
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
  });
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
): Effect.Effect<CaseExportResult, DomainTag> {
  return Effect.gen(function* renderCaseExportGen() {
    const normalizedCaseId = parseTrimmedCaseId(caseId) ?? undefined;
    if (normalizedCaseId === undefined) {
      return { files: new Map<string, string>(), evidenceRows: [] };
    }

    const entityRows = yield* tryDb(() =>
      entitiesRepo.listPeersForCase(db, normalizedCaseId)
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
      evidenceRepo.listActiveForCaseAsc(db, normalizedCaseId)
    );
    const caseRow = yield* tryDb(() =>
      casesRepo.getByIdUnchecked(db, normalizedCaseId)
    );

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
  });
}
