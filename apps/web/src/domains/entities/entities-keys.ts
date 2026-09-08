export const entitiesKeys = {
  all: (caseId: string) => ["entities", caseId] as const,
  detail: (caseId: string, slug: string) => ["entity", caseId, slug] as const,
};
