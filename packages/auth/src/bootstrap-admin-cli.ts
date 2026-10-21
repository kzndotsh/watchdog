/**
 * First-admin command: creates the instance admin of a fresh install without opening public
 * signup. Locally `just admin` runs this file through tsx; the web image carries it bundled as
 * `bootstrap-admin.mjs` (packages/auth/scripts/build-bootstrap.mjs). Exit codes: 0 created,
 * 1 refused or failed, 2 bad usage.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

import {
  adminDisplayName,
  BOOTSTRAP_ADMIN_USAGE,
  checkAdminEmail,
  checkAdminPassword,
  firstLine,
  generateAdminPassword,
  parseBootstrapAdminArgs,
} from "./bootstrap-admin-args";

const out = (text: string) => process.stdout.write(`${text}\n`);
const err = (text: string) => process.stderr.write(`${text}\n`);

function usageError(message: string): never {
  err(`bootstrap-admin: ${message}\n\n${BOOTSTRAP_ADMIN_USAGE}`);
  process.exit(2);
}

/** Fd 0 is stdin whether it is a pipe or a file; only `--password-stdin` reads it. */
function readStdin(): string {
  return readFileSync(0, "utf-8");
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const parsed = parseBootstrapAdminArgs(process.argv.slice(2));
  if (!parsed.ok) usageError(parsed.message);
  const { args } = parsed;
  if (args.help) {
    out(BOOTSTRAP_ADMIN_USAGE);
    return;
  }

  // Ask for the email only when a person is typing; a pipe carries the password instead.
  let rawEmail = args.email;
  if (rawEmail === undefined) {
    if (!process.stdin.isTTY || args.passwordStdin) {
      usageError("--email is required when stdin is not a terminal");
    }
    rawEmail = await ask("Admin email: ");
  }
  const email = checkAdminEmail(rawEmail);
  if (!email.ok) usageError(email.message);

  let name = args.name;
  if (name === undefined && process.stdin.isTTY && !args.passwordStdin) {
    name = await ask("Display name (blank: from the email): ");
  }

  let password: string;
  const generated = !args.passwordStdin;
  if (args.passwordStdin) {
    password = firstLine(readStdin());
    const problem = checkAdminPassword(password);
    if (!problem.ok) usageError(problem.message);
  } else {
    // A generated password goes to a terminal, or where the caller asked for it. Printed into a
    // pipe or a log it would sit there; refuse before creating anything.
    if (!process.stdout.isTTY && !args.printPassword) {
      usageError(
        "stdout is not a terminal, so a generated password would be printed into a pipe or a log. Add --print-password to capture it, or --password-stdin to choose your own"
      );
    }
    password = generateAdminPassword();
  }

  // The database client reads the validated env on import: load it late so a bad environment
  // prints its message instead of a stack trace.
  const { withPool } = await import("@watchdog/db");
  const { bootstrapFirstAdmin } = await import("./bootstrap-admin");
  await withPool(async ({ db }) => {
    const result = await bootstrapFirstAdmin(db, {
      email: email.email,
      name: adminDisplayName(name, email.email),
      password,
    });
    if (result.status === "admin-exists") {
      err(
        "bootstrap-admin: an instance admin already exists, so nothing was created. Sign in with that account; it can promote others in Settings, Users."
      );
      process.exitCode = 1;
      return;
    }
    if (result.status === "email-taken") {
      err(
        `bootstrap-admin: ${email.email} already has an account but no instance admin exists. Use another email, or promote that account directly in the database.`
      );
      process.exitCode = 1;
      return;
    }
    out(`Created instance admin ${email.email.toLowerCase()}.`);
    if (generated) {
      out(`Password (shown once, store it now): ${password}`);
    }
    out(
      "Sign in at /auth/sign-in, then create your organization on the onboarding screen. Public signup stays closed."
    );
  });
}

try {
  await main();
} catch (error) {
  err(
    `bootstrap-admin: failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
}
