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
  edgesRepo,
  entitiesRepo,
  eventsRepo,
  evidenceRepo,
  identifiersRepo,
  questionsRepo,
  type EvidenceRow,
  type EntityPeerRow,
} from "@watchdog/db";
import type { EntityKind } from "@watchdog/schemas/shared";
import {
  entityDisplayLabel,
  parseTrimmedCaseId,
} from "@watchdog/schemas/shared";

import { nowIsoStringEffect } from "./clock";
import type { Db } from "./db-service";
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
import { tryDbWith } from "./postgres-effect";
import type { DomainTag } from "./tagged-errors";

export interface EntityExport {
  organizationId: string;
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
): Effect.Effect<EntityExport | null, DomainTag, Db> {
  return Effect.gen(function* renderEntityMarkdownGen() {
    const normalizedEntityId = parseTrimmedCaseId(entityId) ?? undefined;
    if (normalizedEntityId === undefined) return null;

    const row = yield* tryDbWith((exec) =>
      entitiesRepo.getWithCase(exec, normalizedEntityId)
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
        tryDbWith((exec) => claimsRepo.listForEntity(exec, normalizedEntityId)),
        tryDbWith((exec) =>
          identifiersRepo.listForEntity(exec, normalizedEntityId)
        ),
        tryDbWith((exec) =>
          edgesRepo.listOutboundForEntity(exec, row.caseId, normalizedEntityId)
        ),
        tryDbWith((exec) => eventsRepo.listForEntity(exec, normalizedEntityId)),
        tryDbWith((exec) =>
          questionsRepo.listForEntity(exec, normalizedEntityId)
        ),
        tryDbWith((exec) =>
          evidenceRepo.listForEntity(exec, row.caseId, normalizedEntityId)
        ),
        peerMap
          ? Effect.succeed([] as EntityPeerRow[])
          : tryDbWith((exec) =>
              entitiesRepo.listPeersForCase(exec, row.caseId)
            ),
      ],
      { concurrency: "unbounded" }
    );

    const resolvedPeers =
      peerMap ?? new Map(peers.map((e) => [e.id, e] as const));
    const exportedAt = yield* nowIsoStringEffect;

    const lines: string[] = [
      buildEntityFrontmatter({
        kind: row.kind,
        caseSlug: row.caseSlug,
        entityId: row.id,
        exportedAt,
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
      organizationId: row.caseOrganizationId,
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
  /** Where the shadow workspace lives: `<export>/<organizationId>/<caseSlug>`. Null when the Case is gone. */
  location: { organizationId: string; caseSlug: string } | null;
}

/**
 * Render all entities in a Case and return them as a map of
 * `kind/slug` → markdown string.
 * Also includes evidence file references in CASE.md.
 */
export function renderCaseExportEffect(
  caseId: string
): Effect.Effect<CaseExportResult, DomainTag, Db> {
  return Effect.gen(function* renderCaseExportGen() {
    const normalizedCaseId = parseTrimmedCaseId(caseId) ?? undefined;
    if (normalizedCaseId === undefined) {
      return {
        files: new Map<string, string>(),
        evidenceRows: [],
        location: null,
      };
    }

    const entityRows = yield* tryDbWith((exec) =>
      entitiesRepo.listPeersForCase(exec, normalizedCaseId)
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

    const evidenceRows = yield* tryDbWith((exec) =>
      evidenceRepo.listActiveForCaseAsc(exec, normalizedCaseId)
    );
    const caseRow = yield* tryDbWith((exec) =>
      casesRepo.getByIdUnchecked(exec, normalizedCaseId)
    );

    if (caseRow) {
      const exportedAt = yield* nowIsoStringEffect;
      const attestations = evidenceRows.filter(isAttestationExportRow);

      mdFiles.set(
        "CASE.md",
        buildCaseMarkdown(caseRow, mdFiles, evidenceRows.length, exportedAt)
      );

      if (attestations.length > 0) {
        mdFiles.set(
          "evidence/attestations.md",
          buildAttestationsMarkdown(caseRow.slug, attestations, exportedAt)
        );
      }
    }

    return {
      files: mdFiles,
      evidenceRows,
      location: caseRow
        ? { organizationId: caseRow.organizationId, caseSlug: caseRow.slug }
        : null,
    };
  });
}
