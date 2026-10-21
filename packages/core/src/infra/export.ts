import { Effect } from "effect";
/**
 * export.ts — Render an Entity (and its full graph data) as an Obsidian-style
 * markdown note matching the locked Export format from the greenfield plan.
 *
 * Note anatomy:
 *   YAML frontmatter → Connections → Identifiers → Summary → Claims →
 *   Timeline → Questions → Notes → Evidence
 */

import type { EvidenceRow, EntityPeerRow } from "@watchdog/db";
import type {
  CaseId,
  EntityKind,
  OrganizationId,
} from "@watchdog/schemas/shared";
import {
  entityDisplayLabel,
  parseTrimmedCaseId,
  parseTrimmedUuid,
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
import {
  entitiesRepoFxDb,
  claimsRepoFxDb,
  identifiersRepoFxDb,
  edgesRepoFxDb,
  eventsRepoFxDb,
  questionsRepoFxDb,
  evidenceRepoFxDb,
  casesRepoFxDb,
} from "./repos-fx";
import type { DomainTag } from "./tagged-errors";

export type EntityExport = {
  organizationId: OrganizationId;
  caseSlug: string;
  entitySlug: string;
  kind: EntityKind;
  markdown: string;
};

/**
 * Fetch all data for an entity and render it as a markdown note.
 * Pass `peerMap` when exporting a whole Case to avoid re-scanning peers.
 */
export function renderEntityMarkdownEffect(
  entityId: string,
  peerMap?: Map<string, EntityPeerRow>
): Effect.Effect<EntityExport | null, DomainTag, Db> {
  return Effect.gen(function* renderEntityMarkdownGen() {
    const normalizedEntityId = parseTrimmedUuid(entityId) ?? undefined;
    if (normalizedEntityId === undefined) return null;

    const row = yield* entitiesRepoFxDb.getWithCase(normalizedEntityId);
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
        claimsRepoFxDb.listForEntity(normalizedEntityId),
        identifiersRepoFxDb.listForEntity(normalizedEntityId),
        edgesRepoFxDb.listOutboundForEntity(row.caseId, normalizedEntityId),
        eventsRepoFxDb.listForEntity(normalizedEntityId),
        questionsRepoFxDb.listForEntity(normalizedEntityId),
        evidenceRepoFxDb.listForEntity(row.caseId, normalizedEntityId),
        peerMap
          ? Effect.succeed([] as EntityPeerRow[])
          : entitiesRepoFxDb.listPeersForCase(row.caseId),
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

type CaseExportResult = {
  files: Map<string, string>;
  evidenceRows: EvidenceRow[];
  /** Where the shadow workspace lives: `<export>/<organizationId>/<caseSlug>`. Null when the Case is gone. */
  location: { organizationId: OrganizationId; caseSlug: string } | null;
};

/**
 * Render all entities in a Case and return them as a map of
 * `kind/slug` → markdown string.
 * Also includes evidence file references in CASE.md.
 */
export function renderCaseExportEffect(
  caseId: CaseId
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

    const entityRows =
      yield* entitiesRepoFxDb.listPeersForCase(normalizedCaseId);
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

    const evidenceRows =
      yield* evidenceRepoFxDb.listActiveForCaseAsc(normalizedCaseId);
    const caseRow = yield* casesRepoFxDb.getByIdUnchecked(normalizedCaseId);

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
