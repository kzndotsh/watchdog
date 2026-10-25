/**
 * Egress classes: where a Cap sends a Case's seed, derived from the contacts it declares
 * (`deriveEgressClasses`). A Case allows a set of them (`cases.allowed_egress`).
 * - `local`: nothing leaves the install.
 * - `target`: the subject's own infrastructure sees a request (it can tip the subject off).
 * - `public_lookup`: an anonymous public source, or a fixed download, learns of the request.
 * - `account_lookup`: a vendor API bound to the operator's account key.
 * - `model`: Case text goes to an AI model endpoint.
 */
export const EGRESS_CLASSES = [
  "local",
  "target",
  "public_lookup",
  "account_lookup",
  "model",
] as const;
export type EgressClass = (typeof EGRESS_CLASSES)[number];
