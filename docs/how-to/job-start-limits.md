# Job start limits

Job starts are rate limited per organization and per API key, so a runaway agent cannot use up the paid quotas of the providers your Caps call. A start over the limit is refused with HTTP 429 and the stable code `job_start_limited`; nothing is queued.

## How a limit works

- A limit is a number of Job starts per fixed window. The window is `WD_JOB_START_WINDOW_SECONDS` long (default 3600) and is aligned to the database clock, so every web process and the worker agree where a window begins and ends. The count resets when the window ends. A caller who used the last start of one window and the first of the next can start twice the limit within a short span; lower the window, not the limit, if that matters to you.
- Two limits apply to every start. The organization's limit counts every start made in the organization, by a session or by any of its keys. A key's limit counts the starts made with that key. A start must fit both. A session has no key limit.
- Both counts live in Postgres and are taken in the same transaction that creates the Job. Two starts at the last free slot cannot both pass, whatever number of web processes serve them, and a start that fails for any other reason gives its count back.
- The instance defaults are `WD_JOB_START_LIMIT_ORG` (default 600) and `WD_JOB_START_LIMIT_KEY` (default 120), both per window. See the [configuration reference](../reference/platform/configuration.md#job-start-limits).

## What counts as a start

| Path | Counts | Notes |
| --- | --- | --- |
| Cap run (`POST /cases/{caseId}/jobs`, `wd jobs start`, the web app) | 1 |  |
| Retry of a finished Job (`jobs.retry`) | 1 | A retry is a new Job, so it is a new start, including a retry of a Playbook step. |
| Playbook run (`jobs.startPlaybook`) | 1 | The run is the start. The steps the chain creates after the first are part of the run and are not counted: a refusal in the middle would leave a half-finished run. |
| Evidence verbs (`evidence.process`, `evidence.enrich`) | 1 per new Job | Asking again while an open Job exists returns that Job and counts nothing. |
| Case export that runs as a Job (`system.case_export`) | 1 per new export | Triggered by `GET /cases/{caseId}/export.zip` for a large Case, so a key with only `cases:read` can start one. Joining the open export of the Case counts nothing. A refusal answers 429 on that route as well. |

A Job that the worker re-queues after a crash, and a Playbook step the chain creates, are not new starts.

## The refusal

```json
{
  "defined": true,
  "code": "TOO_MANY_REQUESTS",
  "status": 429,
  "message": "Job start limit reached for this API key (120 per 3600 s). Try again in 90 s.",
  "data": {
    "code": "job_start_limited",
    "scope": "key",
    "limit": 120,
    "windowSeconds": 3600,
    "retryAfterSeconds": 90
  }
}
```

`scope` is `organization` or `key`. The `Retry-After` header carries the same number of seconds. The CLI prints `error.code` `job_start_limited` with `error.retryAfterSeconds` and says to run the same command again after that wait.

## Changing a limit

Overrides are stored in Postgres (`job_start_limits`) and replace the instance default for one organization or one key. Read them with `GET /api/v1/organization/job-limits` (any key with `cases:read`: it returns the organization's limit, the calling key's limit, this window's use and the keys that have their own limit). Change them with `PUT /api/v1/organization/job-limits`, which needs a signed-in session, not a key:

```json
{ "maxStarts": 100 }
{ "keyId": "<key id>", "maxStarts": 20 }
{ "keyId": "<key id>", "maxStarts": null }
```

`maxStarts` is a number from 0 to 1 000 000 (0 refuses every start); `null` removes the override. Without `keyId` the call sets the organization's own limit.

| Who | May |
| --- | --- |
| Instance admin | Set any value for the organization or any of its keys. |
| Organization owner or admin | Set a key's limit, and set the organization's limit up to the instance default. Raising it above the default needs an instance admin: the instance default protects provider quotas the whole install shares. |
| Member, or a key | Read only. |

A key belongs to the organization it acts in, resolved as authentication resolves it: the organization named in its metadata, if its owner is still a member. A key that acts in another organization is `not_found`, the same as a missing one. The worker deletes the counters of ended windows hourly, in bounded batches, so idle and deleted keys and organizations leave nothing behind. A key's override goes when the key is deleted, and an organization's when the organization is.
