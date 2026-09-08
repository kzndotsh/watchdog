import { type AnyColumn, sql } from "drizzle-orm";

import { edges } from "../schema/edges";
import { entities } from "../schema/entities";

/** EXISTS: row's entity FK belongs to the given Case. */
export function entityRowInCase(entityIdColumn: AnyColumn, caseId: string) {
  return sql`exists (
    select 1 from ${entities}
    where ${entities.id} = ${entityIdColumn}
      and ${entities.caseId} = ${caseId}
  )`;
}

/** EXISTS: edge id is in the Case (both endpoints belong to the Case). */
export function edgeRowInCase(edgeIdColumn: AnyColumn, caseId: string) {
  return sql`exists (
    select 1 from ${edges} e
    inner join ${entities} fe on fe.id = e.from_id
    inner join ${entities} te on te.id = e.to_id
    where e.id = ${edgeIdColumn}
      and fe.case_id = ${caseId}
      and te.case_id = ${caseId}
  )`;
}
