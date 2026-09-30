export interface AuthErrorDetails {
  /** True for a Better Auth server error (`{ error: { code, message } }`), false for a thrown `Error`. */
  fromServer: boolean;
  /** Better Auth error code, e.g. `EMAIL_NOT_VERIFIED`. */
  code: string | undefined;
  /** Server message, else the thrown error's own message. */
  message: string | undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * Read a Better Auth client error without trusting its type: `{ error: { code, message } }`
 * (a fetch failure), or any thrown `Error`.
 */
export function authErrorDetails(error: unknown): AuthErrorDetails {
  if (!isObject(error)) {
    return { fromServer: false, code: undefined, message: undefined };
  }
  const server: unknown = "error" in error ? error.error : undefined;
  const own = "message" in error ? text(error.message) : undefined;
  if (!isObject(server)) {
    return { fromServer: false, code: undefined, message: own };
  }
  return {
    fromServer: true,
    code: "code" in server ? text(server.code) : undefined,
    message: ("message" in server ? text(server.message) : undefined) ?? own,
  };
}
