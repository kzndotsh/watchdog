import type {
  ClaimRow,
  EdgeRow,
  EntityPeerRow,
  EventRow,
  EvidenceRow,
  IdentifierRow,
  QuestionRow,
} from "@watchdog/db";
import {
  CONFIDENCE_TIER_LABELS,
  ENTITY_KIND_LABELS,
  EVIDENCE_KIND_LABELS,
  IDENTIFIER_STATUS_LABELS,
  IDENTIFIER_TYPE_LABELS,
  entityDisplayLabel,
  evidenceDisplayLabel,
  predicateLabel,
  titleCase,
} from "@watchdog/schemas";

function exportLabel(value: string, labels: Record<string, string>): string {
  return labels[value] ?? titleCase(value);
}

function yamlLine(
  key: string,
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined || value === "") return null;
  return `${key}: ${value}`;
}

export function buildEntityFrontmatter(input: {
  kind: string;
  caseSlug: string;
  entityId: string;
}): string {
  return [
    "---",
    yamlLine("tags", `[${exportLabel(input.kind, ENTITY_KIND_LABELS)}]`),
    yamlLine("case", input.caseSlug),
    yamlLine("entity_id", input.entityId),
    yamlLine("last_exported", new Date().toISOString()),
    "---",
  ]
    .filter(Boolean)
    .join("\n");
}

function connectionPeerLabel(peer: EntityPeerRow): string {
  return entityDisplayLabel(peer);
}

export function appendConnectionsSection(
  lines: string[],
  outEdges: EdgeRow[],
  resolvedPeers: Map<string, EntityPeerRow>
): void {
  if (outEdges.length === 0) return;
  lines.push("## Connections");
  const sorted = [...outEdges].sort((a, b) => {
    const peerA = resolvedPeers.get(a.toId);
    const peerB = resolvedPeers.get(b.toId);
    const labelA = peerA ? connectionPeerLabel(peerA) : "";
    const labelB = peerB ? connectionPeerLabel(peerB) : "";
    return labelA.localeCompare(labelB);
  });
  for (const edge of sorted) {
    const peer = resolvedPeers.get(edge.toId);
    if (!peer) continue;
    const notesSuffix =
      edge.notes !== null && edge.notes !== "" ? ` <!-- ${edge.notes} -->` : "";
    lines.push(
      `${predicateLabel(edge.predicate, "out")}:: [[${peer.slug}]]${notesSuffix}`
    );
  }
  lines.push("");
}

export function appendIdentifiersSection(
  lines: string[],
  entityIdentifiers: IdentifierRow[]
): void {
  if (entityIdentifiers.length === 0) return;
  lines.push(
    "## Identifiers",
    "| Type | Platform | Value | Status | Confidence |",
    "|------|----------|-------|--------|------------|"
  );
  for (const id of entityIdentifiers) {
    const platform = id.platform || "—";
    lines.push(
      `| ${exportLabel(id.type, IDENTIFIER_TYPE_LABELS)} | ${platform} | ${id.value} | ${exportLabel(id.status, IDENTIFIER_STATUS_LABELS)} | ${exportLabel(id.confidence, CONFIDENCE_TIER_LABELS)} |`
    );
  }
  lines.push("");
}

export function appendOptionalTextSection(
  lines: string[],
  heading: string,
  text: string | null
): void {
  if (text === null || text.trim() === "") return;
  lines.push(heading, text.trim(), "");
}

export function appendClaimsSection(
  lines: string[],
  entityClaims: ClaimRow[]
): void {
  if (entityClaims.length === 0) return;
  lines.push("## Claims");
  for (const [i, claim] of entityClaims.entries()) {
    lines.push(
      `${i + 1}. **${claim.text}** — ${exportLabel(claim.confidence, CONFIDENCE_TIER_LABELS)}`
    );
  }
  lines.push("");
}

export function appendTimelineSection(
  lines: string[],
  entityEvents: EventRow[]
): void {
  if (entityEvents.length === 0) return;
  lines.push("## Timeline");
  for (const ev of entityEvents) {
    const where =
      ev.whereText !== null && ev.whereText !== "" ? ` @ ${ev.whereText}` : "";
    lines.push(`- ${ev.when} · ${ev.what}${where}`);
  }
  lines.push("");
}

function questionLabel(index: number): string {
  return `Q${String(index + 1).padStart(2, "0")}`;
}

export function appendQuestionsSection(
  lines: string[],
  entityQuestions: QuestionRow[]
): void {
  if (entityQuestions.length === 0) return;
  lines.push("## Questions");
  const open = entityQuestions.filter((q) => q.status === "open");
  const resolved = entityQuestions.filter((q) => q.status === "resolved");

  for (const [i, q] of open.entries()) {
    lines.push(`- ${questionLabel(i)} ${q.text} — ${titleCase(q.status)}`);
  }
  for (const [i, q] of resolved.entries()) {
    const note =
      q.resolvedNote !== null && q.resolvedNote !== ""
        ? ` → ${q.resolvedNote}`
        : "";
    lines.push(`- ${questionLabel(open.length + i)} ~~${q.text}~~${note}`);
  }
  lines.push("");
}

export function appendEvidenceSection(
  lines: string[],
  entityEvidence: EvidenceRow[]
): void {
  if (entityEvidence.length === 0) return;
  lines.push("## Evidence");
  for (const ev of entityEvidence) {
    const label = evidenceDisplayLabel({
      label: ev.label,
      kind: ev.kind,
      sourceUrl: ev.sourceUrl,
    });
    const kind = EVIDENCE_KIND_LABELS[ev.kind];
    const detail = label === kind ? kind : `${kind} · ${label}`;
    lines.push(`- ${ev.id.slice(0, 8)} · ${detail}`);
  }
  lines.push("");
}

export function buildCaseMarkdown(
  caseRow: {
    name: string;
    slug: string;
    description: string | null;
  },
  mdFiles: Map<string, string>,
  evidenceCount: number
): string {
  const caseLines = [
    "---",
    `name: ${caseRow.name}`,
    `slug: ${caseRow.slug}`,
    caseRow.description !== null && caseRow.description !== ""
      ? `description: ${caseRow.description}`
      : null,
    `exported: ${new Date().toISOString()}`,
    `entities: ${mdFiles.size}`,
    `evidence: ${evidenceCount}`,
    "---",
    "",
    `# ${caseRow.name}`,
    "",
    `${mdFiles.size} entities · ${evidenceCount} evidence items`,
    "",
    "## Entities",
    ...[...mdFiles.keys()].map((k) => `- [[${k.replace(/\.md$/, "")}]]`),
  ];

  return `${caseLines.filter((line) => line !== null).join("\n")}\n`;
}

export function buildAttestationsMarkdown(
  caseSlug: string,
  attestations: EvidenceRow[]
): string {
  const attLines = [
    "---",
    `case: ${caseSlug}`,
    `exported: ${new Date().toISOString()}`,
    "---",
    "",
    "# Attestations",
    "",
  ];
  for (const att of attestations) {
    attLines.push(
      `## ${evidenceDisplayLabel({
        label: att.label,
        kind: att.kind,
        sourceUrl: att.sourceUrl,
      })}`
    );
    if (att.notes !== null && att.notes !== "")
      attLines.push(`*${att.notes}*`, "");
    attLines.push(att.text ?? "", "");
  }
  return attLines.join("\n");
}

export function isAttestationExportRow(evidence: EvidenceRow): boolean {
  return (
    evidence.kind === "attestation" &&
    (evidence.uri === null || evidence.uri === "") &&
    evidence.text !== null &&
    evidence.text !== ""
  );
}
