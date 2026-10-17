# Upgrade a self-hosted install

**What this is:** moving a production compose stack to a newer Watchdog version: the steps, how migrations run, the switch for running them by hand, and what rollback means when migrations only go forward.  
**What this is not:** the first install ([`self-host`](self-host.md)) or the backup commands themselves ([`backup-restore`](backup-restore.md)).

## What an upgrade is

Each image carries the migrations of its version. The `web` container applies the pending ones when it starts, under a Postgres advisory lock (two replicas take turns), and only then listens. A failing migration rolls back, prints `migrate: failed: ...` and exits non-zero, so the container never serves against a half-migrated schema. The `worker` container never migrates: it waits for `web` to be healthy, which means the schema is current.

**Migrations are forward-only.** There is no down-migration. Every release is meant to upgrade from the previous minor release, so go one minor at a time and do not skip. Starting an older image on a database a newer one migrated is not supported: that is what the backup is for.

## Upgrade

Run from the repository directory, with `COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"`.

1. **Read what changed.** Until release images are published ([#310](https://github.com/kzndotsh/watchdog/issues/310)) the images are built from this repository: `git fetch && git log --oneline HEAD..origin/main` lists the changes. Look for migrations (`packages/db/drizzle/`) and for new or changed variables ([`configuration`](../reference/platform/configuration.md); compare with your `.env.production`: the next start refuses a missing required one).

2. **Back up first.** At least the database dump and a copy of `.env.production` with the vault key ([`backup-restore`](backup-restore.md)). This is your only way back.

   ```bash
   mkdir -p backups
   $COMPOSE exec -T postgres sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     > "backups/pre-upgrade-$(date +%Y%m%d-%H%M%S).dump"
   ```

3. **Get the new version.** Building from a checkout:

   ```bash
   git pull --ff-only
   $COMPOSE build
   ```

   With published images, set `WATCHDOG_WEB_IMAGE` and `WATCHDOG_WORKER_IMAGE` to the new tag in `.env.production` and run `$COMPOSE pull`. Pin a version tag, not `latest`, so an upgrade is something you decide.

4. **Restart.** Optionally stop the worker first, so no Job runs against the schema while it changes:

   ```bash
   $COMPOSE stop worker
   $COMPOSE up -d
   ```

   `up -d` recreates the containers whose image or configuration changed. `web` migrates and starts; `worker` starts once `web` is healthy.

5. **Check it.**

   ```bash
   $COMPOSE logs web | grep "migrate:"      # migrate: done  (or: migrate: failed: ...)
   curl -fsS http://127.0.0.1:3000/api/v1/ready
   ```

   Sign in and open a Case. Downtime is the time `web` takes to migrate and boot; sessions survive because they live in Postgres.

## Migrating by hand

For a risky migration, a large database or a change window, turn the automatic run off and migrate when you choose:

1. Set `WD_SKIP_MIGRATIONS=1` in `.env.production`. The `web` container then starts without migrating.
2. Take the dump, then run the migrator once and exit (it holds the same lock):

   ```bash
   $COMPOSE run --rm --no-deps -e WD_SKIP_MIGRATIONS=0 web true
   ```

   `migrate: done` means the schema is current. A failure leaves the database as it was (the migration rolled back).

3. `$COMPOSE up -d` to start the new version. Leave the switch on, or remove the line to return to migrate-on-start.

A web container started with the switch on against a schema it needs a newer version of will fail on the first request that touches the missing column, not at start: do not leave it on and forget to migrate.

## Roll back

Because migrations do not go down, rolling back means going back to the state before the upgrade:

1. Stop the app: `$COMPOSE stop web worker`.
2. Check out the previous version (`git checkout <previous tag or commit>`) and rebuild, or set the image variables back to the previous tag.
3. Restore the pre-upgrade dump into a recreated, empty database, as in [`backup-restore`](backup-restore.md#restore) (step 3). Everything written since the dump is lost; the object store only gained files, which is harmless.
4. `$COMPOSE up -d`. The old image's migrations match the restored dump, so it starts with nothing to apply.

If the failure is the migration itself, nothing needs rolling back: the failed migration rolled back, the old data is intact, and the old image still runs against it. Set `WD_SKIP_MIGRATIONS=1`, start the old version, and report the failure.

## Skipping versions

Upgrade through each minor release, one after another. Jumping several at once can cross a migration that assumed its predecessor ran.
