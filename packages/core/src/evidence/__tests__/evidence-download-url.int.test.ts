import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { getEvidenceDownloadUrlEffect } from "@watchdog/core/evidence";
import { Db, runDomainWith } from "@watchdog/core/infra";
import { db } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, seedEvidence } from "@watchdog/test-db";

import { recordingBlobStore } from "../../infra/blob-store";

const store = recordingBlobStore();
const run = runDomainWith(Layer.mergeAll(Db.layer, store.layer));

beforeEach(async () => {
  await resetTestDb();
});

async function linksFor(mime: string | null) {
  const cased = await seedCase(db);
  const row = await seedEvidence(db, cased.id, {
    uri: `${cased.id}/${"a".repeat(64)}`,
    mime,
  });
  return run(
    getEvidenceDownloadUrlEffect(cased.id, TEST_ORGANIZATION_ID, row.id)
  );
}

function disposition(url: string | null): string | null {
  return url === null
    ? null
    : new URL(url).searchParams.get("response-content-disposition");
}

describe("getEvidenceDownloadUrlEffect", () => {
  it.each(["text/html", "image/svg+xml", "application/pdf", null])(
    "gives %s a download link only, never an inline one",
    async (mime) => {
      const links = await linksFor(mime);
      expect(disposition(links.url)).toBe("attachment");
      expect(links.previewUrl).toBeNull();
    }
  );

  it.each(["image/png", "image/jpeg", "image/gif", "image/webp", "IMAGE/PNG"])(
    "gives %s an inline preview with the type forced, beside the download link",
    async (mime) => {
      const links = await linksFor(mime);
      expect(disposition(links.url)).toBe("attachment");
      expect(disposition(links.previewUrl)).toBe("inline");
      expect(
        new URL(links.previewUrl ?? "").searchParams.get(
          "response-content-type"
        )
      ).toBe(mime.toLowerCase());
    }
  );
});
