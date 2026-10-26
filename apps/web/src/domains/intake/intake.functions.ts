import { createServerFn } from "@tanstack/react-start";

import type { EvidenceRecord, PresignedUpload } from "@/domains/intake/types";
import { listAllPages } from "@/lib/list-pages.server";
import { orpcFromContext } from "@/lib/orpc.server";
import type { ProviderCallList } from "@watchdog/core/jobs";
import {
  attachEvidenceEntityInputSchema,
  confirmFileUploadInputSchema,
  dumpPasteInputSchema,
  dumpUrlInputSchema,
  listEvidenceInputSchema,
  presignUploadInputSchema,
  processEvidenceInputSchema,
} from "@watchdog/schemas/evidence";
import { evidenceScopeInputSchema } from "@watchdog/schemas/graph";

export const getEvidenceDownloadUrlFn = createServerFn({ method: "GET" })
  .validator(evidenceScopeInputSchema)
  .handler(async ({ data, context }): Promise<{ url: string | null }> =>
    orpcFromContext(context).evidence.downloadUrl({
      caseId: data.caseId,
      evidenceId: data.evidenceId,
    })
  );

/**
 * Every page of the Case's Evidence for the screens that still filter in the browser (#552 moves
 * them onto the list standard). The screen's booleans become the declared list's true-only flags.
 */
export const listEvidenceFn = createServerFn({ method: "GET" })
  .validator(listEvidenceInputSchema)
  .handler(async ({ data, context }): Promise<EvidenceRecord[]> =>
    listAllPages(async (page) =>
      orpcFromContext(context).evidence.list({
        caseId: data.caseId,
        ...(data.hiddenOnly ? { hidden: true } : {}),
        ...(data.unprocessedOnly ? { unprocessed: true } : {}),
        ...(data.unattachedOnly ? { unattached: true } : {}),
        ...page,
      })
    )
  );

export const processEvidenceFn = createServerFn({ method: "POST" })
  .validator(processEvidenceInputSchema)
  .handler(async ({ data, context }) =>
    orpcFromContext(context).evidence.process({
      caseId: data.caseId,
      evidenceId: data.evidenceId,
      ai: data.ai,
    })
  );

export const enrichUrlEvidenceFn = createServerFn({ method: "POST" })
  .validator(evidenceScopeInputSchema)
  .handler(async ({ data, context }) =>
    orpcFromContext(context).evidence.enrich({
      caseId: data.caseId,
      evidenceId: data.evidenceId,
    })
  );

export const dumpPasteFn = createServerFn({ method: "POST" })
  .validator(dumpPasteInputSchema)
  .handler(async ({ data, context }): Promise<EvidenceRecord> =>
    orpcFromContext(context).evidence.createPaste(data)
  );

export const dumpUrlFn = createServerFn({ method: "POST" })
  .validator(dumpUrlInputSchema)
  .handler(async ({ data, context }): Promise<EvidenceRecord> =>
    orpcFromContext(context).evidence.createUrl(data)
  );

export const softDeleteEvidenceFn = createServerFn({ method: "POST" })
  .validator(evidenceScopeInputSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> =>
    orpcFromContext(context).evidence.softDelete(data)
  );

export const restoreEvidenceFn = createServerFn({ method: "POST" })
  .validator(evidenceScopeInputSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> =>
    orpcFromContext(context).evidence.restore(data)
  );

export const attachEvidenceEntityFn = createServerFn({ method: "POST" })
  .validator(attachEvidenceEntityInputSchema)
  .handler(async ({ data, context }): Promise<EvidenceRecord> =>
    orpcFromContext(context).evidence.attachEntity(data)
  );

export const presignUploadFn = createServerFn({ method: "POST" })
  .validator(presignUploadInputSchema)
  .handler(async ({ data, context }): Promise<PresignedUpload> =>
    orpcFromContext(context).evidence.presign(data)
  );

export const confirmFileUploadFn = createServerFn({ method: "POST" })
  .validator(confirmFileUploadInputSchema)
  .handler(async ({ data, context }): Promise<EvidenceRecord> =>
    orpcFromContext(context).evidence.confirmFile(data)
  );

export const listEvidenceProviderCallsFn = createServerFn({ method: "GET" })
  .validator(evidenceScopeInputSchema)
  .handler(async ({ data, context }): Promise<ProviderCallList> =>
    orpcFromContext(context).evidence.listProviderCalls({
      caseId: data.caseId,
      evidenceId: data.evidenceId,
    })
  );
