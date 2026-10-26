import { Effect } from "effect";

import { entityListRepo, entityPickerListRepo } from "@watchdog/db";
import type { EntityListRow, EntityPickerListRow } from "@watchdog/db";
import { entityList } from "@watchdog/schemas/graph";
import type {
  CaseId,
  ConfidenceTier,
  EdgePredicate,
  EntityKind,
  ListInput,
  ListPage,
  OrganizationId,
  GraphActor,
} from "@watchdog/schemas/shared";
import {
  PAGE_LIMIT_DEFAULT,
  slugifyName,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { listByIdsEffect, listPageEffect } from "../infra/list-page";
import { entitiesRepoFxDb, entitiesRepoFx } from "../infra/repos-fx";
import {
  boundEchoedId,
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertEntityKindChangeAllowedEffect } from "./edge-update";
import { dossierChannel } from "./graph-activity";
import { runGraphMutation } from "./mutation/run-graph-mutation";
import {
  entitiesTable,
  toEntityRecord,
  type EntityRecord,
} from "./mutation/tables";
import { assertCaseInOrgEffect } from "./patch/guards";
import { seedDefaultQuestionsEffect } from "./questions";

export type { EntityRecord };

/**
 * One Connection of a listed Entity, seen from that Entity: the Edge and its peer. Evidence
 * links are not joined; the Dossier's Connection list carries them.
 */
export type EntityListConnection = {
  id: string;
  fromId: string;
  toId: string;
  predicate: EdgePredicate;
  confidence: ConfidenceTier;
  notes: string | null;
  peerId: string;
  peerName: string;
  peerSlug: string;
  peerKind: EntityKind;
  direction: "out" | "in";
  version: number;
};

/**
 * A row of the Entity list: the Entity with its Connection counts, and the Connection itself
 * when it has exactly one (the Entities table names it in the row).
 */
export type EntityListItem = EntityRecord & {
  connections: { outgoing: number; incoming: number };
  soleConnection: EntityListConnection | null;
};

export type CreateEntityInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  kind: EntityKind;
  name: string;
  slug: string;
} & GraphActor;

export type UpdateEntityFieldsInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  entityId: string;
  /** The `version` the caller last read; an update of a row that moved on is `StaleVersionError`. */
  expectedVersion: number;
  kind?: EntityKind;
  name?: string;
  summary?: string | null;
  notes?: string | null;
} & GraphActor;

/** Rows of the Entity list to wire records (no joins, no extra reads). */
function entityItems(
  rows: readonly EntityListRow[]
): Effect.Effect<readonly EntityRecord[], DomainTag, Db> {
  return Effect.succeed(rows.map((row) => toEntityRecord(row)));
}

/** The row's joined Connection, kept only when it is the Entity's one Connection. */
function soleConnectionOf(row: EntityListRow): EntityListConnection | null {
  const { outgoing, incoming } = row.connections;
  const edge = row.soleConnection;
  if (
    outgoing + incoming !== 1 ||
    edge.edgeId === null ||
    edge.fromId === null ||
    edge.toId === null ||
    edge.predicate === null ||
    edge.confidence === null ||
    edge.version === null ||
    edge.peerId === null ||
    edge.peerName === null ||
    edge.peerSlug === null ||
    edge.peerKind === null
  ) {
    return null;
  }
  return {
    id: edge.edgeId,
    fromId: edge.fromId,
    toId: edge.toId,
    predicate: edge.predicate,
    confidence: edge.confidence,
    notes: edge.notes,
    peerId: edge.peerId,
    peerName: edge.peerName,
    peerSlug: edge.peerSlug,
    peerKind: edge.peerKind,
    direction: edge.fromId === row.id ? "out" : "in",
    version: edge.version,
  };
}

/** Rows of the Entity list to its page items: each Entity with its Connection summary. */
function entityListItems(
  rows: readonly EntityListRow[]
): Effect.Effect<readonly EntityListItem[], DomainTag, Db> {
  return Effect.succeed(
    rows.map((row) => ({
      ...toEntityRecord(row),
      connections: row.connections,
      soleConnection: soleConnectionOf(row),
    }))
  );
}

/**
 * One page of the Case's Entity list (`entityList`, ADR-0007): the declared filters, `q` and
 * sort, keyset paged, with `total` on the first page. Without `input` it is the first page of
 * the default view.
 */
export function listEntitiesForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input?: ListInput<typeof entityList>
): Effect.Effect<ListPage<EntityListItem>, DomainTag, Db> {
  return Effect.gen(function* listEntitiesGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: entityList,
      repo: entityListRepo,
      scope: { caseId: scopedCaseId },
      input: input ?? { caseId: scopedCaseId, limit: PAGE_LIMIT_DEFAULT },
      toItems: entityListItems,
    });
  });
}

/** What an Entity picker shows of an Entity: its label parts and kind, never its notes or counts. */
export type EntityPickerItem = {
  id: string;
  kind: EntityKind;
  name: string;
  slug: string;
};

function pickerItems(
  rows: readonly EntityPickerListRow[]
): Effect.Effect<readonly EntityPickerItem[]> {
  return Effect.succeed(
    rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      slug: row.slug,
    }))
  );
}

/**
 * One page of `entityList` for the Entity pickers (#573): the same declaration, scope, filters,
 * `q`, sort and cursor as `listEntitiesForCaseEffect` (`entityPickerListRepo` shares its binding),
 * with the picker's columns: no Connection counts, no Connection, no summary or notes.
 */
export function listEntityPickerEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: ListInput<typeof entityList>
): Effect.Effect<ListPage<EntityPickerItem>, DomainTag, Db> {
  return Effect.gen(function* listEntityPickerGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: entityList,
      repo: entityPickerListRepo,
      scope: { caseId: scopedCaseId },
      input,
      toItems: pickerItems,
    });
  });
}

/**
 * The Case's Entities that pasted names may mean (the Identifiers bulk add), for at most
 * `ENTITY_NAME_LOOKUP_MAX` names: name equal ignoring case, or slug equal to the slugified name.
 * It may hold several Entities for one name; the caller's rule decides. Case-scoped like every
 * list, so another organization's Case is `not_found`.
 */
export function matchEntityNamesEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  names: readonly string[]
): Effect.Effect<EntityPickerItem[], DomainTag, Db> {
  return Effect.gen(function* matchEntityNamesGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* entitiesRepoFxDb.listMatchingNamesInCase(
      scopedCaseId,
      names
    );
    return rows.map((row) => ({ ...row }));
  });
}

/**
 * The Case's Entities with these ids (a picker's selected value, a filter chip's title), at most
 * `ARRAY_MAX`. Ids outside the Case are left out, so the result may be shorter than `ids`.
 */
export function getEntitiesByIdsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  ids: readonly string[]
): Effect.Effect<EntityRecord[], DomainTag, Db> {
  return Effect.gen(function* getEntitiesByIdsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const items = yield* listByIdsEffect({
      repo: entityListRepo,
      scope: { caseId: scopedCaseId },
      ids,
      toItems: entityItems,
    });
    return [...items];
  });
}

export function getEntityByCaseSlugEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  slug: string
): Effect.Effect<EntityRecord, DomainTag, Db> {
  return Effect.gen(function* getEntityByCaseSlugGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedSlug = slugifyName(slug);
    if (normalizedSlug === "") {
      return yield* new NotFoundError({
        entity: "Entity",
        id: boundEchoedId(slug),
      });
    }
    const row = yield* entitiesRepoFxDb.getByCaseSlug(
      scopedCaseId,
      normalizedSlug
    );
    if (!row) {
      return yield* new NotFoundError({
        entity: "Entity",
        id: boundEchoedId(slug),
      });
    }
    return toEntityRecord(row);
  });
}

export function createEntityEffect(
  input: CreateEntityInput
): Effect.Effect<EntityRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* createEntityGen() {
        const name = trimmedOrUndefined(input.name);
        if (name === undefined) {
          return yield* new InvalidError({ reason: "Entity name is required" });
        }
        const slug = slugifyName(input.slug);
        if (slug === "") {
          return yield* new InvalidError({ reason: "Entity slug is required" });
        }
        const existing = yield* entitiesRepoFx.getByCaseSlug(
          w.tx,
          w.caseId,
          slug
        );
        if (existing) {
          return yield* new ConflictError({
            reason: `Slug "${slug}" already exists in this Case`,
          });
        }
        const record = yield* w.insert(entitiesTable, {
          kind: input.kind,
          name,
          slug,
        });
        // Seeding appends no entries of its own: a registered helper, not a module write.
        yield* seedDefaultQuestionsEffect(w.tx, {
          id: record.id,
          caseId: record.caseId,
          kind: record.kind,
        });
        return record;
      })
  );
}

export function updateEntityFieldsEffect(
  input: UpdateEntityFieldsInput
): Effect.Effect<EntityRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* updateEntityGen() {
        const existing = yield* w.get(entitiesTable, input.entityId);
        const nextName =
          input.name === undefined ? undefined : trimmedOrUndefined(input.name);
        if (input.name !== undefined && nextName === undefined) {
          return yield* new InvalidError({ reason: "Entity name is required" });
        }
        if (input.kind !== undefined && input.kind !== existing.kind) {
          yield* assertEntityKindChangeAllowedEffect(
            w.caseId,
            existing.id,
            input.kind,
            w.tx
          );
        }
        return yield* w.update(
          entitiesTable,
          existing.id,
          {
            ...(input.kind === undefined ? {} : { kind: input.kind }),
            ...(nextName === undefined ? {} : { name: nextName }),
            ...(input.summary === undefined
              ? {}
              : { summary: trimmedOrNull(input.summary) }),
            ...(input.notes === undefined
              ? {}
              : { notes: trimmedOrNull(input.notes) }),
          },
          { expectedVersion: input.expectedVersion }
        );
      })
  );
}

export function deleteEntityEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  entityId: string,
  actor?: GraphActor
): Effect.Effect<void, DomainTag, Db> {
  return runGraphMutation(
    { caseId, organizationId, actor, channel: dossierChannel(actor) },
    (w) => Effect.asVoid(w.remove(entitiesTable, entityId))
  );
}
