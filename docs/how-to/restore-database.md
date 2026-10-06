# Restore a database

**What this is:** moving a Watchdog Postgres into a fresh cluster (`pg_dump` and `pg_restore`, a volume rebuild, a new host) and what the activity log does about it.  
**What this is not:** backups policy, or the Export projection ([`caps-boundary`](../reference/platform/caps-boundary.md)); Evidence blobs live in S3 and are restored with their bucket, not with the database ([`local-dev`](local-dev.md)).

## Steps

1. Restore the dump into the new cluster (`pg_restore --no-owner` or `psql < dump.sql`), then `pnpm db:migrate` so the schema is current. The restored migration journal means it applies only what the dump lacks.
2. Start the worker (`pnpm dev:worker`, or your process supervisor) **before or together with** web. The worker runs the activity `xid` boot check first, before its consumer starts.
3. Look for one log line from `activity.restore` on the first boot: `restored database: rewrote N activity xid(s) to 0`. No line means the log was healthy and nothing was changed.
4. Restart web if it was already running during step 2, so its in-memory tailer re-reads the log.

## The `xid` boot check

Every activity entry carries `xid`, the transaction id of the cluster that wrote it ([ADR-0005](../adr/0005-unified-activity-log.md), failure mode 2). Readers (the SSE tailer, replay, the worker consumer) only read rows whose `xid` is below the cluster's oldest running transaction, so a restored row whose `xid` this cluster has not reached yet would stay invisible: no live updates, no replay, no export trigger for those rows, until the new cluster's counter passed it.

At worker boot, `repairRestoredActivityXidsEffect` (`packages/core/src/activity/restore-check.ts`) asks one question: is any entry's `xid` at or past `pg_snapshot_xmax(pg_current_snapshot())`, the next transaction id the cluster will hand out? If not, it does nothing. If so, in one transaction it:

- rewrites **every** entry's `xid` to `0` (not only the future ones: ids keep the insertion order, so `(0, id)` stays a total order, and a partial rewrite would sort the newest restored rows before older ones),
- rewrites the retention floor's `xid` (`activity_floor`) to `0`,
- rewrites every consumer cursor's `xid` (`activity_cursors`) to `0`, so the worker resumes at the same entry it had read.

Entries with `xid` 0 are readable at once and sort before every live entry. The check is idempotent, so a second boot finds nothing to repair.

### What clients see

A browser or agent cursor from the old cluster (`xid:id` with an old `xid`) is ahead of the restored log, so the next reconnect gets one `resync` and the client refetches everything. A cursor can also be below the retention floor (entries after it were pruned); that is `resync` too. Neither is data loss: the log is a signal and a feed, not the Case Graph.

If the worker's stored cursor is ahead of the restored log (the dump is older than the worker's last run), it re-exports every Case and resets to the head. Wiped databases behave the same way.

## Retention

The worker prunes entries older than 90 days once a day (newest 200 per Case stay) and raises the replay floor with each batch; see [ADR-0005](../adr/0005-unified-activity-log.md) decision 8 and `apps/worker/AGENTS.md`. Pruning only removes activity entries (feed history and the live signal), never Graph rows or `graph_writes`, so a restore of an old dump is not made worse by it.

## Check it by hand

```sql
-- Future xids (any row here means the boot check has not run yet):
SELECT count(*) FROM activity
WHERE xid >= pg_snapshot_xmax(pg_current_snapshot());

-- The retention floor (no row: nothing was ever pruned):
SELECT xid, id, updated_at FROM activity_floor;

-- Consumer positions:
SELECT consumer, xid, id, updated_at FROM activity_cursors;
```

Do not edit `activity` by hand. If the boot check cannot run (the worker will not start), fix the worker first; the repair is safe to run on any boot.
