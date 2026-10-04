import {
  AbortedError,
  HttpVendorError,
  MissingCredentialError,
  ParseVendorError,
  RateLimitedError,
  ValidationVendorError,
} from "./tagged-errors";

/*
 * Short constructors for the vendor tags. Each returns the tagged error
 * itself (it is an `Error`, so it can be thrown inside a `tryPromise` thunk
 * and `mapToolsCatch` passes it through unchanged).
 */

export function httpVendorError(
  service: string,
  status: number,
  detail?: string
): HttpVendorError {
  return new HttpVendorError({
    service,
    status,
    ...(detail === undefined ? {} : { detail }),
  });
}

export function missingCredentialError(slot: string): MissingCredentialError {
  return new MissingCredentialError({ slot });
}

export function rateLimitedVendorError(
  service: string,
  subject: string
): RateLimitedError {
  return new RateLimitedError({ service, subject });
}

export function parseVendorError(
  service: string,
  subject: string,
  detail?: string
): ParseVendorError {
  return new ParseVendorError({
    service,
    subject,
    ...(detail === undefined ? {} : { detail }),
  });
}

export function validationVendorError(message: string): ValidationVendorError {
  return new ValidationVendorError({ message });
}

export function abortedError(message: string): AbortedError {
  return new AbortedError({ message });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
