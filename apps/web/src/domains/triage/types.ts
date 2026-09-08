import {
  acceptProposalInputSchema,
  listProposalsInputSchema,
  rejectProposalInputSchema,
  type AcceptProposalInput,
  type ConfidenceTier,
  type ListProposalsInput,
  type RejectProposalInput,
} from "@watchdog/schemas";

export {
  acceptProposalInputSchema,
  listProposalsInputSchema,
  rejectProposalInputSchema,
};
export type { AcceptProposalInput, ListProposalsInput, RejectProposalInput };

/** Client Accept composer values (confidence + optional evidence / attestation). */
export interface AcceptFormValues {
  confidence: ConfidenceTier;
  evidenceIds: string[];
  attestationText: string;
}
