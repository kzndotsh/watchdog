# Back up and restore

**What this is:** what to back up on a self-hosted Watchdog (Postgres, the object store, the vault master key), the commands that do it against the production compose stack, and the order to restore in.  
**What this is not:** the activity `xid` check after a restore ([`restore-database`](restore-database.md)), upgrades ([`upgrade`](upgrade.md)) or a backup schedule (use cron or your host's snapshots).

> **Back up `WD_MASTER_VAULT_KEY`. Without it every stored Cap credential is unreadable, and no backup of the database can bring it back.** The vault encrypts credentials with a key derived from it; Postgres holds only ciphertext. Losing or changing the key does not break Watchdog, it silently empties the vault: Caps that need a key fail until you enter each credential again in Settings, Credentials. Keep a copy of the key outside the server (a password manager or your secrets store), apart from the database dumps, and check that you can read it back.

## What to back up

| What | Where it lives | Why | How |
| --- | --- | --- | --- |
| Postgres | `postgres_data` volume | Cases, the Graph, Jobs, accounts, organizations, API keys, vault ciphertext | [`pg_dump`](#postgres) |
| Object store | `s3_data` volume, bucket `S3_BUCKET` | Evidence files and Cap artifacts | [bucket sync](#object-store) |
| `WD_MASTER_VAULT_KEY` | `.env.production` | Decrypts the vault | [copy it out](#the-vault-key-and-the-env-file) |
| `.env.production` | the host | `BETTER_AUTH_SECRET` (changing it signs everyone out), the database and store credentials, your settings | copy it with the key |
| Case Export | `export_data` volume | A projection the worker rebuilds from Postgres (`rescanAllCasesEffect`) | nothing to do |

**Take both at one quiet moment.** Evidence rows in Postgres point at objects in the bucket, and the app both adds objects (uploads) and removes them (deleting a Case deletes its files). A dump and a sync taken while the app runs can disagree: a Case deleted between them comes back from the dump with no files. For a backup you must trust (before an upgrade, before a move), stop the app for the few minutes both take: `$COMPOSE stop web worker`, run the dump and the sync below, then `$COMPOSE start web worker`. For routine live backups, take the dump first and the sync right after, and know the window: files added in between are in the sync but not the dump (harmless), a Case deleted in between is the case above. A versioned bucket on an external store closes it.

## Postgres

Every command below runs from the repository directory. Put the two flags you reuse in the shell first:

```bash
COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
```

Dump (custom format, compressed, restorable selectively; the stack keeps running):

```bash
mkdir -p backups
$COMPOSE exec -T postgres sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "backups/watchdog-$(date +%Y%m%d-%H%M%S).dump"
```

The dump runs inside the Postgres container, so `pg_dump` always matches the server version. Check it is not empty and lists the tables:

```bash
$COMPOSE exec -T postgres pg_restore --list < backups/watchdog-20261017-120000.dump | head
```

CI exercises this dump and a restore into an empty database on every container run (`docker/smoke.sh`, step 5).

## Object store

The store speaks S3 and publishes `127.0.0.1:${S3_PUBLISH_PORT:-9100}` on the host. Any S3 client works; this uses the AWS CLI from a throwaway container so nothing is installed:

```bash
set -a; . ./.env.production; set +a
mkdir -p backups/evidence
docker run --rm --network host -v "$PWD/backups/evidence:/backup" \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" -e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
  amazon/aws-cli s3 sync "s3://${S3_BUCKET:-watchdog-evidence}" /backup \
  --endpoint-url "http://127.0.0.1:${S3_PUBLISH_PORT:-9100}"
```

`sync` copies only what changed, so run it as often as you like. Evidence is content-addressed (the object key holds the file's sha256), so objects never change after they are written.

Keep the `s3_data` volume itself out of file-level backups while the store runs: it is a database of volume files and a copy taken mid-write can be unusable. The bucket sync is the supported copy. If you moved Evidence to an external store (AWS S3, R2, MinIO), use that provider's versioning or replication instead.

## The vault key and the env file

```bash
install -m 600 .env.production backups/env.production.$(date +%Y%m%d)
```

Move that file off the server, to a place only you can read: it holds every secret. Do not store it next to the dumps in the same bucket without encrypting it: dump plus key together read your credentials.

## Rotating the vault key

Rotate the key when it leaks, when you replace a placeholder or weak one (the app now refuses those at start), or on a schedule. Do not just replace `WD_MASTER_VAULT_KEY` in `.env.production` when credentials are stored: that makes every one of them unreadable. `vault-rekey` re-encrypts them instead:

1. **Back up the database first** (and the old `.env.production`): a rotation rewrites every credential row. Stop `web` and `worker` so nothing writes credentials meanwhile.
2. Generate the new key (`openssl rand -base64 32`) and put it in `.env.production` as `WD_MASTER_VAULT_KEY`. Keep the old value to hand.
3. Run the command with the old key in the environment, never as an argument (it would land in your shell history and the process list):

   ```bash
   read -rs WD_MASTER_VAULT_KEY_OLD   # paste the old key, nothing is echoed
   export WD_MASTER_VAULT_KEY_OLD
   $COMPOSE run --rm --no-deps -e WD_MASTER_VAULT_KEY_OLD web node vault-rekey.mjs
   unset WD_MASTER_VAULT_KEY_OLD
   ```

   From a source checkout the same thing is `WD_MASTER_VAULT_KEY_OLD=... just vault-rekey`; `--old-key-stdin` reads the old key from the first line of stdin instead.

4. It prints counts only. `re-encrypted N credential(s)` means done; start the app (`$COMPOSE up -d web worker`).

All or nothing: it opens every credential with the old key first and writes only if every one opens. If any fails it prints how many and changes nothing (usually a wrong old key). A second run fails with "looks like a rerun" and changes nothing, because the old key no longer opens them. The old key may be a placeholder or short; the new one must pass the normal checks. Two runs cannot interleave (an advisory lock). Then retire the old key and update the copy you keep outside the server ([above](#the-vault-key-and-the-env-file)).

## Restore

Restore into a fresh stack or over a broken one. The order matters:

1. **Stop the app**, keep Postgres and the store up:

   ```bash
   $COMPOSE stop web worker
   ```

2. **Put `.env.production` back**, with the original `WD_MASTER_VAULT_KEY` and `BETTER_AUTH_SECRET`. A new vault key makes the restored credentials unreadable.

3. **Restore Postgres into an empty database.** Drop and recreate it (`--force` ends any leftover connection), then load the dump. Do not restore over a database that already holds data: `pg_restore --clean` cannot drop the queue schema's partitions, and a half-applied restore is worse than none.

   ```bash
   $COMPOSE exec -T postgres sh -c 'dropdb --force --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
   $COMPOSE exec -T postgres sh -c 'pg_restore --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     < backups/watchdog-20261017-120000.dump
   ```

   On a brand-new stack the database is already empty: skip the first command. The dump recreates the extensions, schemas and the migration journal, so the web container applies only the migrations a newer image adds.

4. **Restore the bucket** (the stack's `s3-init` has created it and its CORS rule; if you started from nothing run `$COMPOSE up s3-init` first):

   ```bash
   docker run --rm --network host -v "$PWD/backups/evidence:/backup" \
     -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" -e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
     amazon/aws-cli s3 sync /backup "s3://${S3_BUCKET:-watchdog-evidence}" \
     --endpoint-url "http://127.0.0.1:${S3_PUBLISH_PORT:-9100}"
   ```

5. **Start the app.** The web container applies any migration the dump lacks (an older dump on a newer image), then the worker runs its activity `xid` check on boot:

   ```bash
   $COMPOSE up -d web worker
   ```

   Read the boot notes in [`restore-database`](restore-database.md) for the one `activity.restore` log line and what clients see.

6. **Check it**: `curl -fsS http://127.0.0.1:3000/api/v1/ready`, sign in, open a Case, download an Evidence file (the bucket), and run any Cap that uses a stored credential (the vault key). A credential that fails to decrypt means the key differs from the one the credentials were saved with.

Restoring onto a different host also needs the new `BETTER_AUTH_URL` and, behind a reverse proxy, the same [`S3_PUBLIC_URL`](reverse-proxy.md) as before.

## What was verified

The Postgres dump and the restore into an empty database run in CI (`docker/smoke.sh`: the restored database holds the admin account and the same migration journal). The bucket sync and the restore order above were run once by hand against a throwaway copy of the production compose stack (project `ops311-prod`, removed afterwards); they are not in CI.
