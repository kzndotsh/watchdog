-- Custom SQL migration file, put your code below! --
-- #302: Evidence cited by a Proposal or Job cannot be hard-deleted (the Evidence end of
-- proposal_evidence / job_evidence is ON DELETE RESTRICT: Evidence is forensic). A Case delete must
-- still remove everything in it, but Postgres checks RESTRICT when the cascaded Evidence delete
-- finishes, before the cascade has reached the Job or Proposal and its link rows. So the Case's
-- link rows go first, in a BEFORE DELETE trigger on cases. (Case ids are indexed on both link
-- tables for this.) Triggers are not part of drizzle's snapshot, like activity_notify (0015).
CREATE FUNCTION "evidence_links_before_case_delete"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  DELETE FROM "proposal_evidence" WHERE "case_id" = OLD."id";
  DELETE FROM "job_evidence" WHERE "case_id" = OLD."id";
  RETURN OLD;
END
$fn$;--> statement-breakpoint
CREATE TRIGGER "evidence_links_before_case_delete_trg"
  BEFORE DELETE ON "cases"
  FOR EACH ROW EXECUTE FUNCTION "evidence_links_before_case_delete"();
