export const entitiesKeys = {
  all: (caseId: string) => ["entities", caseId] as const,
  detail: (caseId: string, slug: string) =>
    ["entities", "detail", caseId, slug] as const,
};
