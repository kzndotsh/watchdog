import { describe, expect, expectTypeOf, it } from "vitest";
/**
 * Type test (#667): a record's shape is owned by its `@watchdog/schemas` schema. Each core
 * record type equals the schema's `z.output`, and each row mapper returns exactly it, so a field
 * added to a schema fails here (or in the mapper) until core fills it. Graph records are checked
 * beside them in `graph/__tests__/record-parity.types.test.ts`. `pnpm typecheck` compiles this
 * file; the runtime assertion only keeps vitest honest.
 */
import type { z } from "zod";

import type {
  caseCountsSchema,
  caseSchema,
  deletedCaseSchema,
  deletionPolicySchema,
  restoredCaseSchema,
} from "@watchdog/schemas/cases";
import type { evidenceSchema } from "@watchdog/schemas/evidence";
import type {
  taskBoardSchema,
  taskEntityLabelSchema,
  taskListItemSchema,
  taskSchema,
} from "@watchdog/schemas/feed";
import type {
  entityPickerItemSchema,
  graphEgoSchema,
  graphSnapshotSchema,
} from "@watchdog/schemas/graph";
import type {
  collectLocatedSchema,
  collectQueueItemSchema,
  jobListSchema,
  jobSchema,
  proposalQueueItemSchema,
  proposalSchema,
  providerCallListSchema,
  providerCallSchema,
} from "@watchdog/schemas/jobs";

import type {
  DeletedCaseRecord,
  DeletionPolicy,
  RestoredCaseRecord,
} from "../case-deletion";
import type { CaseCounts, CaseRecord } from "../cases";
import type { toRecord as toCaseRecord } from "../cases/case-record";
import type { EvidenceRecord } from "../evidence";
import type { toEvidenceRecord } from "../evidence/evidence";
import type { EntityPickerItem, GraphEgo, GraphSnapshot } from "../graph";
import type {
  CollectLocatedItem,
  CollectQueueItem,
  JobListRecord,
  JobRecord,
  ProviderCallList,
  ProviderCallRecord,
} from "../jobs";
import type { toJobListRecord, toJobRecord } from "../jobs/start-job";
import type { ProposalQueueItem, ProposalRecord } from "../proposals";
import type {
  TaskBoardRecord,
  TaskEntityLabel,
  TaskListItem,
  TaskRecord,
} from "../tasks";

describe("records equal their schemas' output", () => {
  it("types each record", () => {
    expectTypeOf<CaseRecord>().toEqualTypeOf<z.output<typeof caseSchema>>();
    expectTypeOf<RestoredCaseRecord>().toEqualTypeOf<
      z.output<typeof restoredCaseSchema>
    >();
    expectTypeOf<DeletedCaseRecord>().toEqualTypeOf<
      z.output<typeof deletedCaseSchema>
    >();
    expectTypeOf<DeletionPolicy>().toEqualTypeOf<
      z.output<typeof deletionPolicySchema>
    >();
    expectTypeOf<CaseCounts>().toEqualTypeOf<
      z.output<typeof caseCountsSchema>
    >();
    expectTypeOf<EvidenceRecord>().toEqualTypeOf<
      z.output<typeof evidenceSchema>
    >();
    expectTypeOf<JobRecord>().toEqualTypeOf<z.output<typeof jobSchema>>();
    expectTypeOf<JobListRecord>().toEqualTypeOf<
      z.output<typeof jobListSchema>
    >();
    expectTypeOf<CollectQueueItem>().toEqualTypeOf<
      z.output<typeof collectQueueItemSchema>
    >();
    expectTypeOf<CollectLocatedItem>().toEqualTypeOf<
      z.output<typeof collectLocatedSchema>
    >();
    expectTypeOf<ProviderCallRecord>().toEqualTypeOf<
      z.output<typeof providerCallSchema>
    >();
    expectTypeOf<ProviderCallList>().toEqualTypeOf<
      z.output<typeof providerCallListSchema>
    >();
    expectTypeOf<ProposalRecord>().toEqualTypeOf<
      z.output<typeof proposalSchema>
    >();
    expectTypeOf<ProposalQueueItem>().toEqualTypeOf<
      z.output<typeof proposalQueueItemSchema>
    >();
    expectTypeOf<TaskRecord>().toEqualTypeOf<z.output<typeof taskSchema>>();
    expectTypeOf<TaskEntityLabel>().toEqualTypeOf<
      z.output<typeof taskEntityLabelSchema>
    >();
    expectTypeOf<TaskListItem>().toEqualTypeOf<
      z.output<typeof taskListItemSchema>
    >();
    expectTypeOf<TaskBoardRecord>().toEqualTypeOf<
      z.output<typeof taskBoardSchema>
    >();
    expectTypeOf<EntityPickerItem>().toEqualTypeOf<
      z.output<typeof entityPickerItemSchema>
    >();
    expectTypeOf<GraphSnapshot>().toEqualTypeOf<
      z.output<typeof graphSnapshotSchema>
    >();
    expectTypeOf<GraphEgo>().toEqualTypeOf<z.output<typeof graphEgoSchema>>();
    expect(true).toBe(true);
  });

  it("has each row mapper return its record", () => {
    expectTypeOf<ReturnType<typeof toCaseRecord>>().toEqualTypeOf<
      z.output<typeof caseSchema>
    >();
    expectTypeOf<ReturnType<typeof toEvidenceRecord>>().toEqualTypeOf<
      z.output<typeof evidenceSchema>
    >();
    expectTypeOf<ReturnType<typeof toJobRecord>>().toEqualTypeOf<
      z.output<typeof jobSchema>
    >();
    expectTypeOf<ReturnType<typeof toJobListRecord>>().toEqualTypeOf<
      z.output<typeof jobListSchema>
    >();
    expect(true).toBe(true);
  });
});
