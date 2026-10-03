# Tutorial: first investigation

A walk through one Case from empty install to accepted Graph content (~30 min). It mirrors the `@journey` e2e (`e2e/specs/journeys/core-loop.spec.ts`). Toolchain setup is in [`../how-to/local-dev.md`](../how-to/local-dev.md).

**Done-when:** You have a Case, one Evidence row from a paste dump, one Proposal in Triage, and the accepted patch visible on an Entity Dossier.

**Prerequisites:** [`../how-to/local-dev.md`](../how-to/local-dev.md) and [`../how-to/auth-setup.md`](../how-to/auth-setup.md) done (web + worker running, signed in).

---

## 1. Create a Case

1. Open **Manage → Cases** (`/cases`).
2. **New Case** → name e.g. `Tutorial Case` → create.
3. **Open** the Case (sets Active Case + lands on Case Overview).

**Checkpoint:** Sidebar shows your Case name; Overview stats load.

---

## 2. Paste evidence

1. Go to **Collect** (`/collect`).
2. **Paste** in the toolbar → paste a short text note (e.g. `Contact alice@mailhost.test, profile at https://wiki.mailhost.test/ada`) → confirm dump.
3. Pick **Unattached** or create/select an Entity in the dump dialog.

**Checkpoint:** A new row appears in the Collect queue; Detail **Content** tab shows your text and a content hash.

Use a real-looking address like the one above: Harvest only extracts emails, phones, and handles, and it discards placeholder domains such as `example.com`, so a note without one yields no Proposal in step 3.

---

## 3. Process into a Proposal

1. With the Evidence row selected, open Detail **Runs** (or Process from Content).
2. Run **Harvest** (`evidence.harvest`) on the attached Entity (create a `person` Entity in the dump dialog if you used Unattached).
3. Wait for Job status **succeeded** (worker must be running: `pnpm dev:worker`).

**Checkpoint:** Job detail shows artifacts; if interpret succeeded, Triage shows a pending Proposal (or Collect links to Triage).

If interpret failed (amber text in the job detail strip), Evidence and Job still succeeded; fix Entity attachment or retry. See [`../how-to/troubleshooting.md`](../how-to/troubleshooting.md).

---

## 4. Triage Accept

1. Open **Triage** (`/triage`).
2. Select the pending Proposal → review patch ops.
3. Choose confidence **unverified** (or **possible** / **confirmed** with evidence rules) → **Accept**.

**Checkpoint:** Proposal leaves pending queue; Entity Dossier shows new Claims/Identifiers from the patch.

---

## 5. Verify on Dossier

1. Open **Entities** → click the Entity → **Overview** / **Claims**.
2. Confirm accepted content matches the Proposal.

**Checkpoint:** Graph row exists; Export projection will regenerate under `export/` (optional: Cases card → Export zip).

---

## Next steps

- Cap credentials for DNS/AI Caps: [`../reference/platform/caps-boundary.md#cap-credentials`](../reference/platform/caps-boundary.md#cap-credentials)
- CLI and agent API: [`../how-to/agent-cli.md`](../how-to/agent-cli.md)
- Why Accept gates exist: [`../reference/contracts/custody.md`](../reference/contracts/custody.md)
- The product loop: [`../explanation/product.md`](../explanation/product.md)
