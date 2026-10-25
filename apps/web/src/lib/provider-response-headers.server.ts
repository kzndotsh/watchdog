/**
 * The headers of a stored provider response (#498). The body is bytes a third party sent, so the
 * browser is never allowed to interpret it: it is an attachment of generic bytes, `nosniff` stops
 * type guessing, and a `sandbox` policy with no sources covers a client that opens it anyway. The
 * provider's own content type stays in the call's record and is not sent here.
 */
export function providerResponseHeaders(
  callId: string,
  response: { readonly bytes: Uint8Array; readonly sha256: string }
): Record<string, string> {
  return {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="provider-response-${callId}.bin"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Length": String(response.bytes.byteLength),
    "Cache-Control": "private, no-store",
    "X-Content-SHA256": response.sha256,
  };
}
