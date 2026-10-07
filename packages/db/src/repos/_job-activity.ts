import { jobs } from "../schema/jobs";

/** The Job fields an activity entry is derived from (cancel and abandon return only these). */
export interface JobActivityFields {
  id: string;
  caseId: (typeof jobs.$inferSelect)["caseId"];
  actorId: string;
  actorLabel: string | null;
  playbookRunId: string | null;
}

export const jobActivityColumns = {
  id: jobs.id,
  caseId: jobs.caseId,
  actorId: jobs.actorId,
  actorLabel: jobs.actorLabel,
  playbookRunId: jobs.playbookRunId,
};
