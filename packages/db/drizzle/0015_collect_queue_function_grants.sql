-- Collect's queue (#574): the callable SECURITY DEFINER functions write the projection and its
-- bookkeeping with the owner's rights, so only the application role may run them. A new function
-- is executable by PUBLIC, which let any login (watchdog_readonly too, after `SET TRANSACTION
-- READ WRITE`) rebuild a Case's queue or clear the stale log. `applyAppRoleGrants` grants EXECUTE
-- back to the application role.
REVOKE ALL ON FUNCTION public.collect_queue_flush() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.collect_queue_rebuild(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.collect_queue_find_drift(integer) FROM PUBLIC;
