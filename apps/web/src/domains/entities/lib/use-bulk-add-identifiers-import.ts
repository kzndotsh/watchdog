import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { createIdentifierFn } from "@/domains/entities/identifiers/identifiers.functions";
import {
  identifierPasteRowKey,
  isIdentifierPasteRowImportable,
  rebuildIdentifierPaste,
  type IdentifierPasteRow,
  type IdentifierPasteTable,
} from "@/domains/entities/lib/parse-identifier-paste";
import { errMessage } from "@/lib/utils";

export function useBulkAddIdentifiersImport(options: {
  caseId: string;
  onImported?: (entityIds: string[]) => Promise<void>;
  onClose: () => void;
  retainFailedImport: (input: {
    paste: string;
    serverErrors: Map<string, string>;
  }) => void;
}) {
  const { caseId, onImported, onClose, retainFailedImport } = options;

  return useMutation({
    mutationFn: async (input: {
      rows: IdentifierPasteRow[];
      table: IdentifierPasteTable;
    }) => {
      let imported = 0;
      const importedEntityIds: string[] = [];
      const failed: {
        sourceIndex: number;
        key: string;
        message: string;
      }[] = [];
      for (const row of input.rows) {
        if (
          !isIdentifierPasteRowImportable(row) ||
          row.entityId === null ||
          row.type === null
        ) {
          continue;
        }
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- sequential partial success
          await createIdentifierFn({
            data: {
              caseId,
              entityId: row.entityId,
              type: row.type,
              value: row.value,
              platform: row.platform === "" ? undefined : row.platform,
              status: row.status,
              confidence: row.confidence,
            },
          });
          imported += 1;
          importedEntityIds.push(row.entityId);
        } catch (error) {
          failed.push({
            sourceIndex: row.sourceIndex,
            key: identifierPasteRowKey(row),
            message: errMessage(error, "Failed to add"),
          });
        }
      }
      return { imported, failed, importedEntityIds };
    },
    onSuccess: async (result, vars) => {
      const uniqueIds = [...new Set(result.importedEntityIds)];
      if (uniqueIds.length > 0) {
        await onImported?.(uniqueIds);
      }
      const invalidCount = vars.rows.filter(
        (row) => !isIdentifierPasteRowImportable(row)
      ).length;
      const skipped = result.failed.length + invalidCount;
      const summary = `Imported ${result.imported} · ${skipped} skipped`;
      if (result.imported > 0) {
        toast.success(summary);
      } else {
        toast.error(summary);
      }
      if (result.failed.length === 0 && invalidCount === 0) {
        onClose();
        return;
      }
      const keep: number[] = [];
      for (const row of vars.rows) {
        if (!isIdentifierPasteRowImportable(row)) keep.push(row.sourceIndex);
      }
      for (const row of result.failed) {
        keep.push(row.sourceIndex);
      }
      retainFailedImport({
        paste: rebuildIdentifierPaste({
          table: vars.table,
          keepSourceIndices: keep,
        }),
        serverErrors: new Map(
          result.failed.map((row) => [row.key, row.message])
        ),
      });
    },
  });
}
