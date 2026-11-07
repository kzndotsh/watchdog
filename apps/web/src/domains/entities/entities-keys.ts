export const entitiesKeys = {
  all: (caseId: string) => ["entities", caseId] as const,
  detail: (caseId: string, slug: string) =>
    ["entities", caseId, "detail", slug] as const,
};
