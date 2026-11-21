import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  dropCaseFromCaches,
  forgetMissingCase,
} from "@/domains/cases/hooks/case-cache";
import { pickDefaultCase } from "@/domains/cases/lib/active-case";
import {
  caseByIdQuery,
  caseBySlugQuery,
  casesKeys,
} from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { buildCaseRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";

const ALPHA = buildCaseRecord({
  id: testCaseId(1),
  slug: "alpha",
  name: "Alpha",
});
const BETA = buildCaseRecord({ id: testCaseId(2), slug: "beta", name: "Beta" });

function seededClient(cases: CaseRecord[]): QueryClient {
  const client = new QueryClient();
  client.setQueryData(casesKeys.visible(), cases);
  for (const row of [ALPHA, BETA]) {
    client.setQueryData(caseByIdQuery(row.id).queryKey, row);
    client.setQueryData(caseBySlugQuery(row.slug).queryKey, row);
  }
  return client;
}

describe("dropCaseFromCaches", () => {
  it("removes the Case from the shared list and forgets its detail rows, so a link cannot reopen it from cache", () => {
    const client = seededClient([ALPHA, BETA]);

    dropCaseFromCaches(client, ALPHA);

    expect(client.getQueryData<CaseRecord[]>(casesKeys.visible())).toEqual([
      BETA,
    ]);
    expect(
      client.getQueryData(caseBySlugQuery(ALPHA.slug).queryKey)
    ).toBeUndefined();
    expect(
      client.getQueryData(caseByIdQuery(ALPHA.id).queryKey)
    ).toBeUndefined();
    expect(client.getQueryData(caseBySlugQuery(BETA.slug).queryKey)).toEqual(
      BETA
    );
  });

  it("leaves a Case-less screen whose last Case was the deleted one on the first remaining Case", () => {
    const client = seededClient([ALPHA, BETA]);

    dropCaseFromCaches(client, ALPHA);

    const cases = client.getQueryData<CaseRecord[]>(casesKeys.visible()) ?? [];
    expect(pickDefaultCase(cases, ALPHA.id)).toEqual(BETA);
  });

  it("leaves no Active Case when it was the last Case", () => {
    const client = seededClient([ALPHA]);

    dropCaseFromCaches(client, ALPHA);

    const cases = client.getQueryData<CaseRecord[]>(casesKeys.visible()) ?? [];
    expect(cases).toEqual([]);
    expect(pickDefaultCase(cases, ALPHA.id)).toBeNull();
  });
});

describe("forgetMissingCase", () => {
  it("drops the cached answers a stale route guard may hold for a Case that is visible again", () => {
    const client = seededClient([BETA]);
    client.setQueryData(casesKeys.deletedBySlug(ALPHA.slug), ALPHA);
    client.setQueryData(caseBySlugQuery(ALPHA.slug).queryKey, null);

    forgetMissingCase(client, ALPHA);

    expect(
      client.getQueryData(caseBySlugQuery(ALPHA.slug).queryKey)
    ).toBeUndefined();
    expect(
      client.getQueryData(casesKeys.deletedBySlug(ALPHA.slug))
    ).toBeUndefined();
  });
});
