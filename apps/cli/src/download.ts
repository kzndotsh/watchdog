import { writeFile } from "node:fs/promises";
import path from "node:path";

import { getConfig } from "./client";
import { fail } from "./io";

const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

function safeDownloadFilename(
  contentDisposition: string | null,
  fallback: string
): string {
  if (contentDisposition === null || contentDisposition === "") {
    return fallback;
  }
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(
    contentDisposition
  );
  const raw = match?.[1]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const base = path.basename(raw.replaceAll(/['"]/g, ""));
  if (base === "" || base === "." || base === ".." || base.includes("..")) {
    return fallback;
  }
  return base;
}

interface DownloadToFileInput {
  urlPath: string;
  outPath?: string;
  fallbackFilename: string;
}

/**
 * Authenticated GET for binary/markdown export routes (not on oRPC contract).
 * Checks res.ok before writing — never creates the output file on error.
 */
export async function downloadToFile(
  input: DownloadToFileInput
): Promise<string> {
  const { apiUrl, apiKey } = getConfig();
  const base = apiUrl.replace(/\/$/, "");
  const url = `${base}${input.urlPath.startsWith("/") ? "" : "/"}${input.urlPath}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    fail(
      "DOWNLOAD_FAILED",
      error instanceof Error ? error.message : "download request failed",
      { help: ["wd --help"] }
    );
  }

  if (!res.ok) {
    const text = await res.text();
    const body = text.slice(0, 500);
    fail("DOWNLOAD_FAILED", `HTTP ${res.status}: ${body || res.statusText}`, {
      status: res.status,
      help: ["wd --help"],
    });
  }

  const filename = safeDownloadFilename(
    res.headers.get("content-disposition"),
    input.fallbackFilename
  );
  const outPath =
    input.outPath !== undefined && input.outPath !== ""
      ? input.outPath
      : path.join(process.cwd(), filename);

  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  return outPath;
}
