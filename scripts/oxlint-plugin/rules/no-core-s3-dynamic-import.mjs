import { bansDynamicImport } from "../lib/dynamic-import.mjs";

export const noCoreS3DynamicImport = bansDynamicImport(
  "@aws-sdk/client-s3",
  "Ban `import('@aws-sdk/client-s3')`, which bypasses the static S3Client import ban.",
  "Core reads the S3 client from the BlobStore service (infra/blob-store.ts, see packages/core/AGENTS.md); a dynamic import of @aws-sdk/client-s3 bypasses the S3Client ban."
);
