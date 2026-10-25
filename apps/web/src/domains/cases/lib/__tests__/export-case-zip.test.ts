import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import {
  exportCaseZip,
  TOAST_EXPORT_BUSY,
  TOAST_EXPORT_QUEUED,
  TOAST_RAW_BODIES_REFUSED,
} from "@/domains/cases/lib/export-case-zip";
import { toast } from "@/shared/ui/toast";

const CASE_ID = "11111111-1111-4111-8111-111111111111";

describe("exportCaseZip", () => {
  const clicked: string[] = [];

  beforeEach(() => {
    clicked.length = 0;
    vi.stubGlobal("document", {
      createElement: () => ({
        href: "",
        click() {
          clicked.push(this.href);
        },
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands a small Case to the browser's download, after a probe that it cancels", async () => {
    let probeSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        probeSignal = init.signal ?? undefined;
        return Promise.resolve(new Response(null, { status: 200 }));
      })
    );

    await exportCaseZip(CASE_ID);

    expect(clicked).toEqual([`/api/v1/cases/${CASE_ID}/export.zip`]);
    expect(probeSignal?.aborted).toBe(true);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("tells the user a large Case runs as a Job, and starts no download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 202 })))
    );

    await exportCaseZip(CASE_ID);

    expect(toast.info).toHaveBeenCalledWith(TOAST_EXPORT_QUEUED);
    expect(clicked).toEqual([]);
  });

  it("asks for raw provider responses on the probe and on the download, and says why a refusal happened", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        urls.push(url);
        return Promise.resolve(new Response(null, { status: 200 }));
      })
    );
    await exportCaseZip(CASE_ID, { shouldIncludeRawBodies: true });
    const asked = `/api/v1/cases/${CASE_ID}/export.zip?rawBodies=1`;
    expect(urls).toEqual([asked]);
    expect(clicked).toEqual([asked]);

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("no", { status: 403 })))
    );
    clicked.length = 0;
    await exportCaseZip(CASE_ID, { shouldIncludeRawBodies: true });
    expect(toast.error).toHaveBeenCalledWith(TOAST_RAW_BODIES_REFUSED);
    expect(clicked).toEqual([]);
  });

  it("says another export is running when the server answers 409, and downloads nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("busy", { status: 409 })))
    );
    await exportCaseZip(CASE_ID);
    expect(toast.error).toHaveBeenCalledWith(TOAST_EXPORT_BUSY);
    expect(clicked).toEqual([]);
  });

  it("says it could not export when the server refuses or is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("no", { status: 403 })))
    );
    await exportCaseZip(CASE_ID);
    expect(toast.error).toHaveBeenCalledWith("Couldn't export Case");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline")))
    );
    await exportCaseZip(CASE_ID);
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(clicked).toEqual([]);
  });
});
