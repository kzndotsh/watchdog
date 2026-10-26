import { couldnt } from "@/lib/utils";

/** Transient toast copy — keep user-state verbs (`Couldn't`) per docs/explanation/ux.md */

export const TOAST_COPIED = "Copied";
/** A URL-selected Evidence item that is no longer in the Case: the selection is cleared. */
export const TOAST_EVIDENCE_SELECTION_GONE =
  "That evidence item is no longer in this Case";
export const TOAST_COULDNT_COPY = "Couldn't copy";

export const TOAST_CASE_UPDATED = "Case updated";
export const TOAST_ENTITY_UPDATED = "Entity updated";
export const TOAST_IDENTIFIER_UPDATED = "Identifier updated";
export const TOAST_ENTITY_CREATED = "Entity created";
export const TOAST_IDENTIFIER_ADDED = "Identifier added";
export const TOAST_TASK_CREATED = "Task created";
export const TOAST_TASK_UPDATED = "Task updated";
export const TOAST_TASK_DELETED = "Task deleted";

export const TOAST_USER_DISABLED = "User disabled";
export const TOAST_USER_ENABLED = "User enabled";
export const TOAST_SESSIONS_REVOKED = "Sessions revoked";

export const TOAST_IMPORT_LOADING = "Importing identifiers…";
export const TOAST_IMPORT_FAILED = couldnt("import", "identifiers");
export const TOAST_UPLOAD_LOADING = "Uploading files…";
export const TOAST_UPLOAD_FAILED = couldnt("upload", "files");
export const TOAST_PROPOSAL_SELECTION_GONE =
  "That proposal is no longer in this Case";
/** A URL-selected Collect item (a row, a Job or a run) that is no longer in the Case: the selection is cleared. */
export const TOAST_COLLECT_SELECTION_GONE =
  "That item is no longer in this Case's Collect queue";
