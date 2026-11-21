/**
 * Job / Cap artifact + capability id contracts.
 * Persistence policy lives here — not in `@watchdog/ai` (LLM/extract only).
 */

/** Deterministic identifier harvest from Evidence text. */
export const EVIDENCE_HARVEST_CAPABILITY_ID = "evidence.harvest";
/** LLM structured extract from Evidence text. */
export const EVIDENCE_EXTRACT_AI_CAPABILITY_ID = "evidence.extract.ai";

export const URL_ENRICH_CAPABILITY_ID = "network.url.enrich";

export const PROCESS_CAPABILITY_IDS = [
  EVIDENCE_HARVEST_CAPABILITY_ID,
  EVIDENCE_EXTRACT_AI_CAPABILITY_ID,
] as const;

export function isProcessCapability(capabilityId: string): boolean {
  return (PROCESS_CAPABILITY_IDS as readonly string[]).includes(capabilityId);
}

/** Packed EvidenceSnapshot JSON uploaded by Process Caps. */
export const EVIDENCE_SNAPSHOT_ARTIFACT = "evidence-snapshot.json";

/**
 * Full Cap report (Cortex-style `full`).
 * Process Caps: ProcessExtractDraft. Collect Caps: raw lookup JSON.
 */
export const REPORT_JSON_ARTIFACT = "report.json";

/**
 * Candidate identifiers / derived IOCs (Cortex-style `artifacts`).
 * Never auto-applied — human Accept via Proposal only.
 */
export const DERIVED_JSON_ARTIFACT = "derived.json";

/**
 * Combined live+Wayback markdown from network.url.enrich.
 * Job Output only — not a Case Evidence row.
 */
export const ENRICHED_MD_ARTIFACT = "enriched.md";

/**
 * Enrich Cap artifacts — Job-only. Intake shows them on the source URL
 * dump’s Output tab; Process packs text from enriched.md when present.
 */
const ENRICH_INTERNAL_ARTIFACTS = new Set([
  "live.html",
  "live.md",
  "live.bin",
  "wayback.html",
  "wayback.md",
  ENRICHED_MD_ARTIFACT,
  "links.json",
  "enrich-summary.json",
]);

/**
 * Artifacts that must not become citable Case Evidence rows.
 * Still stored on the Job (`output`); core loads `report.json` for pure interpret.
 */
export function isJobInternalArtifact(name: string): boolean {
  return (
    name === EVIDENCE_SNAPSHOT_ARTIFACT ||
    name === REPORT_JSON_ARTIFACT ||
    name === DERIVED_JSON_ARTIFACT ||
    name.startsWith("_wd-") ||
    ENRICH_INTERNAL_ARTIFACTS.has(name)
  );
}
