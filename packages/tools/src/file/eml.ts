import { z } from "zod";

export const emlAnalyzeSnapshotSchema = z.object({
  evidenceId: z.uuid(),
  queriedAt: z.string().min(1),
  headers: z.record(z.string(), z.string()),
  from: z.string().nullable(),
  to: z.string().nullable(),
  subject: z.string().nullable(),
  messageId: z.string().nullable(),
  date: z.string().nullable(),
  receivedChain: z.array(z.string()),
  urls: z.array(z.string()),
  emails: z.array(z.string()),
  bodyPreview: z.string().nullable(),
});

export type EmlAnalyzeSnapshot = z.infer<typeof emlAnalyzeSnapshotSchema>;

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function splitHeaderBody(text: string): { headerBlock: string; body: string } {
  const normalized = text.replaceAll("\r\n", "\n");
  const splitIdx = normalized.search(/\n\n/);
  if (splitIdx < 0) return { headerBlock: normalized, body: "" };
  return {
    headerBlock: normalized.slice(0, splitIdx),
    body: normalized.slice(splitIdx + 2),
  };
}

function parseHeaderBlock(headerBlock: string): {
  headers: Record<string, string>;
  receivedChain: string[];
} {
  const unfolded = headerBlock.replaceAll(/\n[ \t]+/g, " ");
  const headers: Record<string, string> = {};
  const receivedChain: string[] = [];
  for (const line of unfolded.split("\n")) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const name = m[1].toLowerCase();
    const value = m[2].trim();
    if (name === "received") {
      receivedChain.push(value.slice(0, 500));
      continue;
    }
    if (!(name in headers)) headers[name] = value.slice(0, 2000);
  }
  return { headers, receivedChain };
}

function collectUrls(body: string): string[] {
  return [...new Set(body.match(URL_RE))].slice(0, 50);
}

function collectEmails(
  headers: Record<string, string>,
  body: string
): string[] {
  const sources = [
    ...(headers.from ? [headers.from] : []),
    ...(headers.to ? [headers.to] : []),
    ...(body.match(EMAIL_RE) ?? []),
  ];
  return [
    ...new Set(
      sources
        .flatMap((s) => s.match(EMAIL_RE) ?? [])
        .map((e) => e.toLowerCase())
    ),
  ].slice(0, 50);
}

/** Parse .eml text into headers + IOC previews (no MIME tree deps). */
export function analyzeEmlText(
  evidenceId: string,
  text: string
): EmlAnalyzeSnapshot {
  const id = evidenceId.trim();
  const { headerBlock, body } = splitHeaderBody(text);
  const { headers, receivedChain } = parseHeaderBlock(headerBlock);

  return emlAnalyzeSnapshotSchema.parse({
    evidenceId: id,
    queriedAt: new Date().toISOString(),
    headers,
    from: headers.from ?? null,
    to: headers.to ?? null,
    subject: headers.subject ?? null,
    messageId: headers["message-id"] ?? null,
    date: headers.date ?? null,
    receivedChain: receivedChain.slice(0, 20),
    urls: collectUrls(body),
    emails: collectEmails(headers, body),
    bodyPreview: body.slice(0, 4000) || null,
  });
}
