import { couldnt } from "@/lib/utils";
import { caseExportZipPath } from "@/shared/lib/api-urls";
import { toast } from "@/shared/ui/toast";

export const TOAST_EXPORT_QUEUED =
  "Large export started. It will appear in Recent activity when it is ready.";

export const TOAST_RAW_BODIES_REFUSED =
  "Only owners and admins can include raw provider responses in an export.";

export const TOAST_BREACH_CREDENTIALS_REFUSED =
  "Only owners and admins can include breach credentials in an export, and only while breach Caps run in full mode.";

export const TOAST_EXPORT_BUSY =
  "Another export of this Case is running. Try again when it finishes.";

export type ExportCaseZipOptions = {
  /**
   * Ask for the raw provider responses each provider's terms allow (owners and admins; the
   * server refuses anyone else). Without it the archive carries each response's hash only.
   */
  shouldIncludeRawBodies?: boolean;
  /**
   * Keep the recovered passwords and hashes in breach Evidence (owners and admins, `full` mode;
   * the server refuses anyone else). Without it those fields are cut to present, kind, length and
   * a reuse fingerprint.
   */
  shouldIncludeBreachCredentials?: boolean;
};

/** Hand the export URL to the browser, which saves the streamed zip. */
function downloadViaBrowser(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.click();
}

/**
 * Export a Case. A small Case streams straight to a download. A large one answers 202 and runs
 * as a Job: the user is told, and the link arrives in Recent activity (the Job's detail).
 * The request is a probe that stops after the headers, so the browser makes the real download.
 */
export async function exportCaseZip(
  caseId: string,
  options: ExportCaseZipOptions = {}
): Promise<void> {
  const url = caseExportZipPath(caseId, options);
  const probe = new AbortController();
  let status: number;
  try {
    const response = await fetch(url, { signal: probe.signal });
    status = response.status;
  } catch {
    toast.error(couldnt("export", "Case"));
    return;
  } finally {
    probe.abort();
  }
  if (status === 202) {
    toast.info(TOAST_EXPORT_QUEUED);
    return;
  }
  if (status === 403 && options.shouldIncludeRawBodies === true) {
    toast.error(TOAST_RAW_BODIES_REFUSED);
    return;
  }
  if (
    (status === 403 || status === 400) &&
    options.shouldIncludeBreachCredentials === true
  ) {
    toast.error(TOAST_BREACH_CREDENTIALS_REFUSED);
    return;
  }
  if (status === 409) {
    toast.error(TOAST_EXPORT_BUSY);
    return;
  }
  if (status < 200 || status >= 300) {
    toast.error(couldnt("export", "Case"));
    return;
  }
  downloadViaBrowser(url);
}
