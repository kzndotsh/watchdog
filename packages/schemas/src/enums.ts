import { z } from "zod";

import { trimmedOrUndefined } from "./primitives";
import {
  CLAIM_CLASSES,
  CONFIDENCE_TIERS,
  EDGE_PREDICATES,
  ENTITY_KINDS,
  EVIDENCE_KINDS,
  IDENTIFIER_STATUSES,
  IDENTIFIER_TYPES,
  GRAPH_WRITE_CHANNELS,
  JOB_STATUSES,
  PLAYBOOK_RUN_STATUSES,
  PROPOSAL_STATUSES,
  QUESTION_STATUSES,
  RETRACT_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "./vocab";

function preprocessTrimmedOptional(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = trimmedOrUndefined(value);
  return trimmed === undefined ? undefined : trimmed.toLowerCase();
}

function preprocessTrimmedRequired(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return trimmed;
  return trimmed.toLowerCase();
}

function optionalTrimmedEnum<T extends z.ZodType<string>>(schema: T) {
  return z.preprocess(preprocessTrimmedOptional, schema.optional());
}

function trimmedEnum<T extends z.ZodType<string>>(schema: T) {
  return z.preprocess(preprocessTrimmedRequired, schema);
}

export const entityKindSchema = z.enum(ENTITY_KINDS);
export const trimmedEntityKindSchema = trimmedEnum(entityKindSchema);
export const optionalEntityKindSchema = optionalTrimmedEnum(entityKindSchema);

export const claimClassSchema = z.enum(CLAIM_CLASSES);
export const trimmedClaimClassSchema = trimmedEnum(claimClassSchema);
export const optionalClaimClassSchema = optionalTrimmedEnum(claimClassSchema);

export const confidenceTierSchema = z.enum(CONFIDENCE_TIERS);
export const trimmedConfidenceTierSchema = trimmedEnum(confidenceTierSchema);
export const optionalConfidenceTierSchema =
  optionalTrimmedEnum(confidenceTierSchema);

export const identifierTypeSchema = z.enum(IDENTIFIER_TYPES);
export const trimmedIdentifierTypeSchema = trimmedEnum(identifierTypeSchema);
export const optionalIdentifierTypeSchema =
  optionalTrimmedEnum(identifierTypeSchema);

export const identifierStatusSchema = z.enum(IDENTIFIER_STATUSES);
export const trimmedIdentifierStatusSchema = trimmedEnum(
  identifierStatusSchema
);
export const optionalIdentifierStatusSchema = optionalTrimmedEnum(
  identifierStatusSchema
);

export const edgePredicateSchema = z.enum(EDGE_PREDICATES);
export const trimmedEdgePredicateSchema = trimmedEnum(edgePredicateSchema);
export const optionalEdgePredicateSchema =
  optionalTrimmedEnum(edgePredicateSchema);

export const evidenceKindSchema = z.enum(EVIDENCE_KINDS);
export const jobStatusSchema = z.enum(JOB_STATUSES);
export const playbookRunStatusSchema = z.enum(PLAYBOOK_RUN_STATUSES);

export const retractKindSchema = z.enum(RETRACT_KINDS);
export const trimmedRetractKindSchema = trimmedEnum(retractKindSchema);

export const questionStatusSchema = z.enum(QUESTION_STATUSES);
export const proposalStatusSchema = z.enum(PROPOSAL_STATUSES);
export const trimmedProposalStatusSchema = trimmedEnum(proposalStatusSchema);
export const optionalProposalStatusSchema =
  optionalTrimmedEnum(proposalStatusSchema);

export const graphWriteChannelSchema = z.enum(GRAPH_WRITE_CHANNELS);
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const trimmedTaskStatusSchema = trimmedEnum(taskStatusSchema);
export const optionalTaskStatusSchema = optionalTrimmedEnum(taskStatusSchema);

export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const trimmedTaskPrioritySchema = trimmedEnum(taskPrioritySchema);
export const optionalTaskPrioritySchema =
  optionalTrimmedEnum(taskPrioritySchema);
