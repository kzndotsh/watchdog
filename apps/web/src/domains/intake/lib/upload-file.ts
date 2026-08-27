import {
  confirmFileUploadFn,
  presignUploadFn,
} from "@/domains/intake/intake.functions";
import type { EvidenceRecord } from "@/domains/intake/types";
import { MAX_UPLOAD_BYTES } from "@watchdog/schemas";

function sha256HexFile(file: File): Promise<string> {
  return file
    .arrayBuffer()
    .then((buf) =>
      crypto.subtle
        .digest("SHA-256", buf)
        .then((digest) =>
          [...new Uint8Array(digest)]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
        )
    );
}

export function uploadFileEvidence(input: {
  caseId: string;
  file: File;
  label?: string;
  entityId?: string;
}): Promise<EvidenceRecord> {
  if (input.file.size < 1) {
    return Promise.reject(new Error("File is empty"));
  }
  if (input.file.size > MAX_UPLOAD_BYTES) {
    return Promise.reject(
      new Error(`File exceeds ${MAX_UPLOAD_BYTES} byte limit`)
    );
  }

  const mime = input.file.type || "application/octet-stream";
  return sha256HexFile(input.file)
    .then((sha256) =>
      presignUploadFn({
        data: {
          caseId: input.caseId,
          sha256,
          mime,
          byteLength: input.file.size,
          name: input.file.name,
        },
      }).then((put) => ({ put, sha256, mime }))
    )
    .then(({ put, sha256, mime }) =>
      fetch(put.url, {
        method: "PUT",
        headers: put.headers,
        body: input.file,
      }).then((res) => {
        if (!res.ok) {
          throw new Error(`MinIO upload failed (${res.status})`);
        }
        return { put, sha256, mime };
      })
    )
    .then(({ put }) =>
      confirmFileUploadFn({
        data: {
          caseId: input.caseId,
          uri: put.uri,
          sha256: put.sha256,
          mime: put.mime,
          byteLength: put.byteLength,
          label: input.label,
          entityId: input.entityId,
        },
      })
    );
}
