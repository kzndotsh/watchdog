import "@tanstack/react-start/server-only";
import { isTextEvidenceMime } from "@/domains/intake/lib/evidence";
import type { GetArtifactContentInput } from "@/domains/jobs/types";
import { orpcFromContext } from "@/lib/orpc.server";
import { runApp } from "@watchdog/api";
import { readArtifactBytesEffect } from "@watchdog/core/blob";

type OrpcFnContext = Parameters<typeof orpcFromContext>[0];

function truncateArtifactText(text: string): string {
  return text.length > 50_000 ? `${text.slice(0, 50_000)}\n…(truncated)` : text;
}

function caseScopedArtifactUri(caseId: string, uri: string): string | null {
  const prefix = `${caseId}/`;
  return uri.startsWith(prefix) ? uri : null;
}

async function resolveJobArtifactUri(
  data: GetArtifactContentInput & { source: "job" },
  context: OrpcFnContext
): Promise<string | null> {
  const job = await orpcFromContext(context).jobs.get({
    caseId: data.caseId,
    jobId: data.jobId,
  });
  const artifact = job.output?.find((row) => row.sha256 === data.sha256);
  if (artifact?.uri === undefined || artifact.uri === "") return null;
  return caseScopedArtifactUri(data.caseId, artifact.uri);
}

async function fetchEvidenceBlobText(
  data: GetArtifactContentInput & { source: "evidence" },
  context: OrpcFnContext
): Promise<string | null> {
  const { url } = await orpcFromContext(context).evidence.downloadUrl({
    caseId: data.caseId,
    evidenceId: data.evidenceId,
  });
  if (url === null || url === "") return null;

  const res = await fetch(url);
  if (!res.ok) return null;

  const bytes = new Uint8Array(await res.arrayBuffer());
  return truncateArtifactText(new TextDecoder().decode(bytes));
}

/** Server-only artifact text fetch for job Detail and Collect evidence preview. */
export async function fetchArtifactContent(
  data: GetArtifactContentInput,
  context: OrpcFnContext
): Promise<{ text: string | null }> {
  // Evidence callers gate on `evidenceNeedsBlobText` (attestation + text mimes).
  if (data.source === "evidence") {
    return { text: await fetchEvidenceBlobText(data, context) };
  }

  if (!isTextEvidenceMime(data.mime)) return { text: null };

  const uri = await resolveJobArtifactUri(data, context);
  if (uri === null) return { text: null };

  const bytes = await runApp(readArtifactBytesEffect(uri));
  return { text: truncateArtifactText(new TextDecoder().decode(bytes)) };
}
