import { createServerFn } from "@tanstack/react-start";

import type { EvidenceRecord, PresignedUpload } from "@/domains/intake/types";
import { orpcFromContext, orpcNullIfNotFound } from "@/lib/orpc.server";
import type { EvidencePickerItem } from "@watchdog/core/evidence";
import type { ProviderCallList } from "@watchdog/core/jobs";
import {
  attachEvidenceEntityInputSchema,
  confirmFileUploadInputSchema,
  dumpPasteInputSchema,
  dumpUrlInputSchema,
  evidenceList,
  presignUploadInputSchema,
  processEvidenceInputSchema,
  getEvidenceManyInputSchema,
} from "@watchdog/schemas/evidence";
import { evidenceScopeInputSchema } from "@watchdog/schemas/graph";
import type { ListPage } from "@watchdog/schemas/shared";

export const getEvidenceDownloadUrlFn = createServerFn({ method: "GET" })
  .validator(evidenceScopeInputSchema)
  .handler(async ({ data, context }): Promise<{ url: string | null }> =>
    orpcFromContext(context).evidence.downloadUrl({
      caseId: data.caseId,
      evidenceId: data.evidenceId,
    })
  );

/**
 * One page of the Case's Evidence list (`evidenceList`, ADR-0007): the declared filters, `q`,
 * sort and cursor pass through whole. The Dossier tab is this list with `entityId` set.
 */
export const listEvidencePageFn = createServerFn({ method: "GET" })
  .validator(evidenceList.input)
  .handler(async ({ data, context }): Promise<ListPage<EvidenceRecord>> =>
    orpcFromContext(context).evidence.list(data)
  );

/**
 * One page of the Case's Evidence list for the Evidence pickers (#566): the list's input, answered
 * with each item's title parts and capture time instead of the record.
 */
export const listEvidencePickerPageFn = createServerFn({ method: "GET" })
  .validator(evidenceList.input)
  .handler(async ({ data, context }): Promise<ListPage<EvidencePickerItem>> =>
    orpcFromContext(context).evidence.pickerPage(data)
  );

/** One Evidence item by id: a URL-selected row the list has not loaded; null when it is gone. */
export const getEvidenceFn = createServerFn({ method: "GET" })
  .validator(evidenceScopeInputSchema)
  .handler(async ({ data, context }): Promise<EvidenceRecord | null> =>
    orpcNullIfNotFound(
      orpcFromContext(context).evidence.get({
        caseId: data.caseId,
        evidenceId: data.evidenceId,
      })
    )
  );

/**
 * Evidence by id as picker items (title parts, no body), hidden or not (linked titles, picked
 * items); ids outside the Case are left out.
 */
export const getEvidenceManyFn = createServerFn({ method: "GET" })
  .validator(getEvidenceManyInputSchema)
  .handler(async ({ data, context }): Promise<EvidencePickerItem[]> =>
    orpcFromContext(context).evidence.getMany(data)
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
