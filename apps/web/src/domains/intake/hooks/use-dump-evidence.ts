import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { dumpPasteFn, dumpUrlFn } from "@/domains/intake/intake.functions";
import { uploadFileEvidence } from "@/domains/intake/lib/upload-file";
import type { EvidenceRecord } from "@/domains/intake/types";
import {
  dumpPasteInputSchema,
  dumpUrlInputSchema,
} from "@/domains/intake/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEvidenceMutation } from "@/shared/lib/query-invalidation";
import { parseOptionalTrimmedUuid } from "@watchdog/schemas";

export interface UseDumpEvidenceOptions {
  caseId: string;
  /** Empty string = unattached. */
  entityId: string;
  onSuccess?: (created: EvidenceRecord[]) => void;
}

export function useDumpEvidence({
  caseId,
  entityId,
  onSuccess,
}: UseDumpEvidenceOptions) {
  const queryClient = useQueryClient();
  const [dumpError, setDumpError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const clearDumpError = useCallback(() => {
    setDumpError(null);
  }, []);

  const targetEntityId =
    entityId === "" ? undefined : parseOptionalTrimmedUuid(entityId);

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const created: EvidenceRecord[] = [];
      const failures: { name: string; message: string }[] = [];
      for (const [i, file] of files.entries()) {
        setUploadStatus(`Uploading ${i + 1}/${files.length}: ${file.name}`);
        try {
          // oxlint-disable-next-line no-await-in-loop -- sequential by design: progress status per file, avoid saturating upload bandwidth
          const uploaded = await uploadFileEvidence({
            caseId,
            file,
            label: file.name,
            entityId: targetEntityId,
          });
          created.push(uploaded);
        } catch (error) {
          failures.push({
            name: file.name,
            message: errMessage(error, "Upload failed"),
          });
        }
      }
      if (created.length === 0 && failures.length > 0) {
        throw new Error(
          failures
            .map((failure) => `${failure.name}: ${failure.message}`)
            .join("; ")
        );
      }
      return { created, failures };
    },
    onSuccess: async ({ created, failures }) => {
      setDumpError(null);
      if (failures.length > 0) {
        const total = created.length + failures.length;
        setDumpError(
          failures
            .map((failure) => `${failure.name}: ${failure.message}`)
            .join("; ")
        );
        toast.warning(`${created.length} of ${total} files uploaded`);
      } else {
        toast.success(
          created.length === 1
            ? "File uploaded"
            : `${created.length} files uploaded`
        );
      }
      if (created.length > 0) {
        await invalidateAfterEvidenceMutation(queryClient, caseId);
        onSuccess?.(created);
      }
    },
    onError: (e) => {
      setDumpError(errMessage(e, "Upload failed"));
    },
    onSettled: () => {
      setUploadStatus(null);
    },
  });

  const pasteMutation = useMutation({
    mutationFn: async (data: {
      body: string;
      label?: string;
      sourceUrl?: string;
    }) =>
      dumpPasteFn({
        data: dumpPasteInputSchema.parse({
          caseId,
          ...data,
          entityId: targetEntityId,
        }),
      }),
    onSuccess: async (created) => {
      setDumpError(null);
      toast.success("Paste saved");
      await invalidateAfterEvidenceMutation(queryClient, caseId);
      onSuccess?.([created]);
    },
    onError: (e) => {
      setDumpError(errMessage(e, "Dump failed"));
    },
  });

  const urlMutation = useMutation({
    mutationFn: async (data: { sourceUrl: string; label?: string }) =>
      dumpUrlFn({
        data: dumpUrlInputSchema.parse({
          caseId,
          ...data,
          entityId: targetEntityId,
        }),
      }),
    onSuccess: async (created) => {
      setDumpError(null);
      toast.success("URL saved");
      await invalidateAfterEvidenceMutation(queryClient, caseId);
      onSuccess?.([created]);
    },
    onError: (e) => {
      setDumpError(errMessage(e, "Dump failed"));
    },
  });

  function onFiles(fileList: FileList | File[]) {
    const files = [...fileList];
    if (files.length === 0) return;
    setDumpError(null);
    uploadMutation.mutate(files);
  }

  const dumpingPaste = pasteMutation.isPending;
  const dumpingUrl = urlMutation.isPending;
  const uploading = uploadMutation.isPending;
  const busy = uploading || dumpingPaste || dumpingUrl;

  return {
    dumpError,
    clearDumpError,
    busy,
    uploading,
    dumpingPaste,
    dumpingUrl,
    uploadStatus,
    onFiles,
    onPaste: pasteMutation.mutate,
    onUrl: urlMutation.mutate,
  };
}
