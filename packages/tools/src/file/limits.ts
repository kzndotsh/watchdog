import { ValidationVendorError } from "../errors";

const MIB = 1024 * 1024;

/** Largest .eml (bytes, UTF-8) one analysis accepts. Larger input is refused. */
export const EML_MAX_INPUT_BYTES = 25 * MIB;

/** Largest file (bytes) one analysis accepts. Larger input is refused. */
export const FILE_MAX_INPUT_BYTES = 64 * MIB;

/** The fixed refusal sentence: it states the limit, never the input. */
export function inputLimitMessage(
  subject: "EML" | "File",
  maxBytes: number
): string {
  return `${subject} input exceeds the ${maxBytes / MIB} MiB analysis limit`;
}

/** Refuse input over the cap before any parsing. */
export function assertWithinInputLimit(
  subject: "EML" | "File",
  byteLength: number,
  maxBytes: number
): void {
  if (byteLength <= maxBytes) return;
  throw new ValidationVendorError({
    message: inputLimitMessage(subject, maxBytes),
  });
}
