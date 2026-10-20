export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** One page of a list endpoint: the rows and the cursor of the next page (null on the last). */
export type E2ePage<T> = { items: T[]; nextCursor: string | null };

/** A list endpoint answers `{ items, nextCursor }`; `parseRow` checks each row. */
function parsePage<T>(
  json: unknown,
  label: string,
  parseRow: (row: unknown, index: number) => T
): E2ePage<T> {
  if (!isRecord(json) || !Array.isArray(json.items)) {
    throw new TypeError(`${label} response was not a page`);
  }
  const { nextCursor } = json;
  if (nextCursor !== null && typeof nextCursor !== "string") {
    throw new TypeError(`${label} page has no nextCursor`);
  }
  return { items: json.items.map(parseRow), nextCursor };
}

export function parseCaseList(
  json: unknown
): E2ePage<{ id: string; name: string; slug: string }> {
  return parsePage(json, "cases", (row, index) => {
    if (
      !isRecord(row) ||
      typeof row.id !== "string" ||
      typeof row.name !== "string" ||
      typeof row.slug !== "string"
    ) {
      throw new Error(`cases[${index}] missing id/name/slug`);
    }
    return { id: row.id, name: row.name, slug: row.slug };
  });
}

export function parseEntity(json: unknown): {
  id: string;
  name: string;
  slug: string;
} {
  if (
    !isRecord(json) ||
    typeof json.id !== "string" ||
    typeof json.name !== "string" ||
    typeof json.slug !== "string"
  ) {
    throw new Error("entity response missing id/name/slug");
  }
  return { id: json.id, name: json.name, slug: json.slug };
}

export function parseEntityId(json: unknown): { id: string } {
  if (!isRecord(json) || typeof json.id !== "string") {
    throw new Error("entity response missing id");
  }
  return { id: json.id };
}

export function parseEvidenceList(json: unknown): E2ePage<{ id: string }> {
  return parsePage(json, "evidence", (row, index) => {
    if (!isRecord(row) || typeof row.id !== "string") {
      throw new Error(`evidence[${index}] missing id`);
    }
    return { id: row.id };
  });
}

export function parseProposalList(
  json: unknown
): E2ePage<{ id: string; status: string }> {
  return parsePage(json, "proposals", (row, index) => {
    if (
      !isRecord(row) ||
      typeof row.id !== "string" ||
      typeof row.status !== "string"
    ) {
      throw new Error(`proposals[${index}] missing id/status`);
    }
    return { id: row.id, status: row.status };
  });
}

export type E2eJob = {
  id: string;
  capabilityId: string;
  status: string;
  error: string | null;
  interpretError: string | null;
};

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseJobList(json: unknown): E2ePage<E2eJob> {
  return parsePage(json, "jobs", (row, index) => {
    if (
      !isRecord(row) ||
      typeof row.id !== "string" ||
      typeof row.capabilityId !== "string" ||
      typeof row.status !== "string"
    ) {
      throw new Error(`jobs[${index}] missing id/capabilityId/status`);
    }
    return {
      id: row.id,
      capabilityId: row.capabilityId,
      status: row.status,
      error: nullableString(row.error),
      interpretError: nullableString(row.interpretError),
    };
  });
}

export const e2eApiParsers = {
  caseList: parseCaseList,
  entity: parseEntity,
  entityId: parseEntityId,
  evidenceList: parseEvidenceList,
  jobList: parseJobList,
  proposalList: parseProposalList,
};
