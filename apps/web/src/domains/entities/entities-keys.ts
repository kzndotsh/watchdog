import { orpc } from "@/lib/orpc-client";

/**
 * Entities keys are the oRPC procedure keys (`[path, { input, type }]`): `all(caseId)` is the
 * partial key `[["entities"], { input: { caseId } }]`, which matches every Entities query of the
 * Case whatever its procedure (the list views, the pickers, the Dossier's detail).
 */
export const entitiesKeys = {
  all: (caseId: string) => orpc.entities.key({ input: { caseId } }),
  /** One Entity by slug, or null: the Dossier's detail (`entities.get`). */
  detail: (caseId: string, slug: string) =>
    orpc.entities.get.key({ type: "query", input: { caseId, slug } }),
};
