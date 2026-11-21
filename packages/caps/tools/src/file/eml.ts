import PostalMime from "postal-mime";
import { z } from "zod";

import { ValidationVendorError } from "../errors";
import { extractEmails, extractUrls, MAX_IOCS } from "./eml-extract";
import { assertWithinInputLimit, EML_MAX_INPUT_BYTES } from "./limits";

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

/**
 * Structural bounds handed to the MIME parser. Together with
 * `EML_MAX_INPUT_BYTES` they bound the work one message can cause.
 */
export const EML_PARSE_LIMITS = {
  maxNestingDepth: 32,
  maxHeadersSize: 1024 * 1024,
  maxPartCount: 1000,
  maxRfc822NestingDepth: 3,
  maxForwardedAddresses: 1000,
} as const;

const HEADER_NAME = /^[\w-]+$/;

function isLimitError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return typeof error.code === "string" && error.code.startsWith("EMAX");
}

function collectHeaders(rows: readonly { key: string; value: string }[]): {
  headers: Record<string, string>;
  receivedChain: string[];
} {
  const headers: Record<string, string> = {};
  const receivedChain: string[] = [];
  for (const row of rows) {
    if (!HEADER_NAME.test(row.key)) continue;
    const value = row.value.trim();
    if (row.key === "received") {
      if (receivedChain.length < 20) receivedChain.push(value.slice(0, 500));
      continue;
    }
    if (!(row.key in headers)) headers[row.key] = value.slice(0, 2000);
  }
  return { headers, receivedChain };
}

/**
 * Parse .eml text into headers + IOC previews. Input over
 * `EML_MAX_INPUT_BYTES` is refused with a `ValidationVendorError`; MIME
 * structure over `EML_PARSE_LIMITS` is refused the same way. IOC extraction
 * is a linear scan.
 */
export async function analyzeEmlText(
  evidenceId: string,
  text: string
): Promise<EmlAnalyzeSnapshot> {
  const id = evidenceId.trim();
  assertWithinInputLimit(
    "EML",
    text.length * 3 <= EML_MAX_INPUT_BYTES
      ? text.length
      : Buffer.byteLength(text, "utf-8"),
    EML_MAX_INPUT_BYTES
  );

  let email: Awaited<ReturnType<PostalMime["parse"]>>;
  try {
    email = await new PostalMime(EML_PARSE_LIMITS).parse(text);
  } catch (error) {
    if (isLimitError(error)) {
      throw new ValidationVendorError({
        message: "EML structure exceeds the analysis limits",
        cause: error,
      });
    }
    throw error;
  }

  const { headers, receivedChain } = collectHeaders(email.headers);
  const body = email.text ?? email.html ?? "";

  const urls = new Set<string>();
  extractUrls(email.text ?? "", urls);
  extractUrls(email.html ?? "", urls);

  const emails = new Set<string>();
  extractEmails(headers.from ?? "", emails);
  extractEmails(headers.to ?? "", emails);
  extractEmails(email.text ?? "", emails);
  extractEmails(email.html ?? "", emails);

  return emlAnalyzeSnapshotSchema.parse({
    evidenceId: id,
    queriedAt: new Date().toISOString(),
    headers,
    from: headers.from ?? null,
    to: headers.to ?? null,
    subject: headers.subject ?? null,
    messageId: headers["message-id"] ?? null,
    date: headers.date ?? null,
    receivedChain,
    urls: [...urls].slice(0, MAX_IOCS),
    emails: [...emails].slice(0, MAX_IOCS),
    bodyPreview: body.slice(0, 4000) || null,
  });
}
