import { couldnt } from "@/lib/utils";
import { caseExportZipPath } from "@/shared/lib/api-urls";
import { toast } from "@/shared/ui/toast";

export const TOAST_EXPORT_QUEUED =
  "Large export started. It will appear in Recent activity when it is ready.";

/** Hand the export URL to the browser, which saves the streamed zip. */
function downloadViaBrowser(caseId: string): void {
  const a = document.createElement("a");
  a.href = caseExportZipPath(caseId);
  a.click();
}

/**
 * Export a Case. A small Case streams straight to a download. A large one answers 202 and runs
 * as a Job: the user is told, and the link arrives in Recent activity (the Job's detail).
 * The request is a probe that stops after the headers, so the browser makes the real download.
 */
export async function exportCaseZip(caseId: string): Promise<void> {
  const probe = new AbortController();
  let status: number;
  try {
    const response = await fetch(caseExportZipPath(caseId), {
      signal: probe.signal,
    });
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
  if (status < 200 || status >= 300) {
    toast.error(couldnt("export", "Case"));
    return;
  }
  downloadViaBrowser(caseId);
}
