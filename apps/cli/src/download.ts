import { createWriteStream } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { getConfig } from "./client";
import {
  SERVER_ERROR_EXIT_CODE,
  fail,
  failInsufficientScope,
  failJobStartLimited,
  missingScopeOf,
  retryAfterSecondsOf,
} from "./io";

const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
/** How often a large Case export's Job is asked whether it is ready, and how long to wait for it. */
const EXPORT_POLL_MS = 5000;
const EXPORT_WAIT_MS = 2 * 60 * 60 * 1000;

/**
 * A large Case export answers 202 with a status URL. Poll it until the Job is done, then fetch
 * the archive from the signed URL it redirects to (without the API key: that host is the object
 * store, not the API). Returns the archive's response, or the status route's error response.
 */
async function followExportJob(
  accepted: Response,
  apiUrl: string,
  apiKey: string
): Promise<Response> {
  const location = accepted.headers.get("location");
  if (location === null) return accepted;
  const statusUrl = new URL(location, apiUrl).toString();
  const deadline = Date.now() + EXPORT_WAIT_MS;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polling is sequential by nature
    await sleep(EXPORT_POLL_MS);
    // oxlint-disable-next-line no-await-in-loop
    const status = await fetch(statusUrl, {
      headers: { "x-api-key": apiKey },
      redirect: "manual",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (status.status === 202) continue;
    const archiveUrl = status.headers.get("location");
    if (status.status === 302 && archiveUrl !== null) {
      return fetch(archiveUrl, { signal: AbortSignal.timeout(EXPORT_WAIT_MS) });
    }
    return status;
  }
  return fail("DOWNLOAD_TIMEOUT", "The export did not finish in time", {
    help: ["Check Recent activity for the export Job, then retry"],
  });
}

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

/** `data` of a JSON error body, or `undefined` when the body is not one. */
function readErrorData(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null
      ? Reflect.get(parsed, "data")
      : undefined;
  } catch {
    return undefined;
  }
}

/** `message` of a JSON error body, or `fallback` when the body is not one. */
function readErrorMessage(text: string, fallback: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    const message: unknown =
      typeof parsed === "object" && parsed !== null
        ? Reflect.get(parsed, "message")
        : undefined;
    return typeof message === "string" ? message : fallback;
  } catch {
    return fallback;
  }
}

type DownloadToFileInput = {
  urlPath: string;
  outPath?: string;
  fallbackFilename: string;
};

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

  const isJob = res.status === 202;
  if (isJob) {
    res = await followExportJob(res, apiUrl, apiKey).catch((error: unknown) =>
      fail(
        "DOWNLOAD_FAILED",
        error instanceof Error ? error.message : "download request failed",
        { help: ["wd --help"] }
      )
    );
  }

  if (!res.ok) {
    const text = await res.text();
    const body = text.slice(0, 500);
    if (res.status === 403) {
      const missing = missingScopeOf(readErrorData(text));
      if (missing !== null) failInsufficientScope(missing, res.status);
    }
    if (res.status === 429) {
      const data = readErrorData(text);
      const retryAfter = retryAfterSecondsOf(data);
      if (retryAfter !== null) {
        failJobStartLimited(
          readErrorMessage(text, "Job start limit reached"),
          retryAfter,
          res.status
        );
      }
    }
    fail("DOWNLOAD_FAILED", `HTTP ${res.status}: ${body || res.statusText}`, {
      status: res.status,
      help: ["wd --help"],
      ...(res.status >= 500 ? { exitCode: SERVER_ERROR_EXIT_CODE } : {}),
    });
  }

  const filename = safeDownloadFilename(
    res.headers.get("content-disposition"),
    input.fallbackFilename
  );
  const outPathArg = input.outPath?.trim();
  const outPath =
    outPathArg !== undefined && outPathArg !== ""
      ? outPathArg
      : path.join(process.cwd(), filename);

  if (isJob && res.body !== null) {
    // A large archive goes to disk as it arrives, never into memory.
    // It lands under a temporary name and takes its own only when whole, so a stream that dies
    // halfway never leaves a file that looks like the archive.
    const partial = `${outPath}.part`;
    try {
      await pipeline(Readable.from(res.body), createWriteStream(partial));
      await rename(partial, outPath);
    } catch (error) {
      await rm(partial, { force: true });
      return fail(
        "DOWNLOAD_FAILED",
        error instanceof Error ? error.message : "download stream failed",
        { help: ["wd --help"] }
      );
    }
    return outPath;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  return outPath;
}
