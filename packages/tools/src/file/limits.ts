import { ValidationVendorError } from "../errors";

const MIB = 1024 * 1024;

/** Largest .eml (bytes, UTF-8) one analysis accepts. Larger input is refused. */
export const EML_MAX_INPUT_BYTES = 25 * MIB;

/** Largest file (bytes) one analysis accepts. Larger input is refused. */
export const FILE_MAX_INPUT_BYTES = 64 * MIB;

/**
 * Refuse input over the cap before any parsing. The message is a fixed
 * sentence: it states the limit, never the input.
 */
export function assertWithinInputLimit(
  subject: "EML" | "File",
  byteLength: number,
  maxBytes: number
): void {
  if (byteLength <= maxBytes) return;
  throw new ValidationVendorError({
    message: `${subject} input exceeds the ${maxBytes / MIB} MiB analysis limit`,
  });
}
