import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  dropCaseFromCaches,
  forgetMissingCase,
} from "@/domains/cases/hooks/case-cache";
import {
  caseByIdQuery,
  caseBySlugQuery,
  casesKeys,
} from "@/domains/cases/queries";
import type { CasesContext } from "@/domains/cases/types";
import { buildCaseRecord } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";

const ALPHA = buildCaseRecord({
  id: testCaseId(1),
  slug: "alpha",
  name: "Alpha",
});
const BETA = buildCaseRecord({ id: testCaseId(2), slug: "beta", name: "Beta" });

function seededClient(context: CasesContext): QueryClient {
  const client = new QueryClient();
  client.setQueryData(casesKeys.context(), context);
  for (const row of [ALPHA, BETA]) {
    client.setQueryData(caseByIdQuery(row.id).queryKey, row);
    client.setQueryData(caseBySlugQuery(row.slug).queryKey, row);
  }
  return client;
}

describe("dropCaseFromCaches", () => {
  it("removes the Case from the shared list and forgets its detail rows, so a link cannot reopen it from cache", () => {
    const client = seededClient({ cases: [ALPHA, BETA], active: BETA });

    dropCaseFromCaches(client, ALPHA);

    expect(
      client.getQueryData<CasesContext>(casesKeys.context())?.cases
    ).toEqual([BETA]);
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

  it("heals the Active Case to the first remaining Case, the way the server cookie does", () => {
    const client = seededClient({ cases: [ALPHA, BETA], active: ALPHA });

    dropCaseFromCaches(client, ALPHA);

    expect(
      client.getQueryData<CasesContext>(casesKeys.context())?.active
    ).toEqual(BETA);
  });

  it("leaves no Active Case when it was the last Case", () => {
    const client = seededClient({ cases: [ALPHA], active: ALPHA });

    dropCaseFromCaches(client, ALPHA);

    expect(client.getQueryData<CasesContext>(casesKeys.context())).toEqual({
      cases: [],
      active: null,
    });
  });
});

describe("forgetMissingCase", () => {
  it("drops the cached answers a stale route guard may hold for a Case that is visible again", () => {
    const client = seededClient({ cases: [BETA], active: BETA });
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
