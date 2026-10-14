# Flaky tests: policy

**What this is:** what counts as a flake, how a re-run that passes is found, how a flaky test is quarantined and tracked, and the rule that every distinct flake has an issue.  
**What this is not:** how to write a deterministic test ([`standards.md`](standards.md)) or the nightly workflow's mechanics ([`ci-gates.md`](../ci-gates.md#nightly-shuffle-advisory)).

A flake is a test that fails and then passes on the same commit with no change. Almost every flake in this repo has been a leak between files that share a worker (`isolate: false`), a missing `await`, or a timer, not bad luck: the [leak canary](standards.md#test-speed-shared-workers) and the nightly shuffle exist to find the first kind. This policy is for what gets through.

Every rule here is guidance enforced by review. Nothing below is a lint rule or a gate, and the page does not pretend otherwise.

## The rule

**Every distinct flake has an issue.** One issue per test and failure signature (the assertion or error text). A second failure of the same signature is a comment with the run link on that issue, not a new issue; a different signature in the same test is a new issue. Re-running CI to unblock a pull request is fine, but the re-run does not close the matter: the issue is filed before the pull request merges, whoever saw the failure.

An issue says: the test file and test name, the failing assertion or error text, the run link, how often it was seen (failures out of runs, if known), and a hypothesis if there is one. Title it `Flaky: <file> <symptom>` and label it `needs-triage`. Do not paste secrets, tokens or local paths; a run link and repo-relative paths are enough.

## Detecting a re-run that passed

A CI run that failed and then passed on a re-run of the same commit has `attempt > 1` and a `success` conclusion. Nothing records it automatically, so look for it, at least weekly and whenever a run on your pull request needed a re-run:

```sh
gh run list --workflow ci.yml --limit 150 \
  --json databaseId,headSha,conclusion,attempt,headBranch \
  --jq '.[] | select(.attempt > 1 and .conclusion == "success")
        | "\(.databaseId) attempt=\(.attempt) \(.headBranch) \(.headSha[0:8])"'
```

For each hit, read what failed the first time:

```sh
gh run view <run-id> --attempt 1 --log-failed
```

Then decide:

- A failed test step (unit, component, gate, integration, Playwright) on a commit that later passed unchanged is a flake: file or update its issue.
- A failed install, a runner or service-container problem (S3, Postgres not ready) is infrastructure, not a flake. Note the run in the PR if it blocked you; no test issue.
- A failure that reproduces on the same commit is a real failure, not a flake.

The nightly shuffle (`nightly-shuffle.yml`) is the other source. A red nightly run names the seed and prints the command that reproduces it:

```sh
pnpm exec vitest run --project <name> --sequence.shuffle.files --sequence.seed=<seed>
```

If that fails locally, it is an order dependence, which is a leak: fix the test that leaked (the failing file is often the victim, the culprit is a file that ran before it; the leak canary names the culprit when it can see the change). If it passes locally, run it again with `--repeats=20` before calling it a flake. Either outcome gets an issue.

To check a suspect test by hand, loop it: `pnpm exec vitest run --project <name> <file> --repeats=50`. Integration needs a scratch database (`just test-db`), never the dev database.

## Quarantine

Fix first. A flake that blocks other people's pull requests and has no fix within a week is quarantined: the test is parked so the suite stops failing on it, and the issue stays open until it is back.

1. Mark the test with `it.skip` and a comment that names the issue and the date it must be fixed or deleted by, for example `// quarantined: #276, fix or delete by 2026-11-01`. A parked `.skip` without a tracked follow-up is banned by the [anti-cheat rule](standards.md#anti-cheat); the comment and the open issue are the follow-up.
2. Put "quarantined" in the issue and link the pull request that parked the test.
3. A quarantined test never stays past its date. When the date comes, fix it, rewrite it, or delete it with the issue's reasoning; do not move the date more than once.

Do not turn on `retry` in the Vitest config and do not loop a test until it passes: a retry hides the leaks this policy exists to find, and the testing standard bans retry-until-green. Playwright keeps `retries: 0`.

## Fixing

Start from the signature, not from the retry. The usual causes here, in order of how often they were the answer:

1. State shared between files in a worker: a spy, stub, timer, `process.env` key or module-level store a previous file left changed. Restore it in `afterEach` and let the canary prove it.
2. A write or timer nobody awaited, which lands in a later test (a late activity-log append, a copy-feedback timer that outlives the test). Await it, or cancel it on unmount.
3. Time and ordering: a test that sleeps, or reads rows without an order. Poll real completion, and sort or compare by id.

When the fix lands, close the issue with the commit, and add the check that would have caught it if one is missing (a canary entry, a stricter assertion, a lint rule).
