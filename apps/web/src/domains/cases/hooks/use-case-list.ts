import { useMemo, useState } from "react";

import type { CaseRecord } from "@/domains/cases/types";
import { slugifyName } from "@watchdog/schemas/shared";

import { useCaseListActions } from "./use-case-list-actions";
import { useCasesContext } from "./use-cases-context";

function caseMatchesSearch(c: CaseRecord, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const slugNeedle = slugifyName(query);
  return (
    c.name.toLowerCase().includes(q) ||
    c.slug.toLowerCase().includes(q) ||
    (slugNeedle !== "" && c.slug === slugNeedle) ||
    (c.description ?? "").toLowerCase().includes(q)
  );
}

function filterCases(cases: CaseRecord[], search: string): CaseRecord[] {
  return [...cases]
    .filter((c) => caseMatchesSearch(c, search))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useCaseList() {
  const {
    cases,
    active,
    pending,
    loadError: casesLoadError,
    retry: retryCases,
    placeholder: casesPlaceholder,
  } = useCasesContext();
  const activeId = active?.id ?? "";

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CaseRecord | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const filtered = useMemo(() => filterCases(cases, search), [cases, search]);

  const actions = useCaseListActions(
    cases,
    activeId,
    setSubmitError,
    setCreateOpen,
    setDeleteTarget,
    setSearch
  );

  return {
    activeId,
    cases,
    pending,
    casesLoadError,
    retryCases,
    casesPlaceholder,
    search,
    setSearch,
    filtered,
    submitError,
    createOpen,
    setCreateOpen,
    deleteTarget,
    ...actions,
  };
}
