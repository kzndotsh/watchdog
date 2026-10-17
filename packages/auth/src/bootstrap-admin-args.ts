import { randomBytes } from "node:crypto";

import { z } from "zod";

/** Shortest password an operator may choose; a generated one is longer. */
export const MIN_ADMIN_PASSWORD_LENGTH = 12;

/** A password to print once: 24 URL-safe characters, 144 bits. */
export function generateAdminPassword(): string {
  return randomBytes(18).toString("base64url");
}

export const BOOTSTRAP_ADMIN_USAGE = `Usage: bootstrap-admin [--email <address>] [--name <name>] [--password-stdin]

Creates the first instance admin of a fresh install, without opening public signup.
Refuses when an instance admin already exists.

  --email <address>   Sign-in email. Prompted for when omitted and stdin is a terminal.
  --name <name>       Display name. Default: the part of the email before the @.
  --password-stdin    Read the password from the first line of stdin
                      (at least ${MIN_ADMIN_PASSWORD_LENGTH} characters). Without it a password is
                      generated and printed once.
  -h, --help          Show this help.

In the container:  docker compose --env-file .env.production -f docker-compose.prod.yml \\
                     run --rm --no-deps web node bootstrap-admin.mjs --email you@example.com
Locally:           just admin --email you@example.com`;

export type BootstrapAdminArgs = {
  readonly email: string | undefined;
  readonly name: string | undefined;
  readonly passwordStdin: boolean;
  readonly help: boolean;
};

export type ParsedArgs =
  | { readonly ok: true; readonly args: BootstrapAdminArgs }
  | { readonly ok: false; readonly message: string };

/** Parse `--flag value`, `--flag=value` and the boolean flags. Unknown flags are errors. */
export function parseBootstrapAdminArgs(argv: readonly string[]): ParsedArgs {
  let email: string | undefined;
  let name: string | undefined;
  let passwordStdin = false;
  let help = false;
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift() ?? "";
    const [flag, inline] = arg.split(/[=](.*)/s, 2);
    const value = () => inline ?? rest.shift();
    if (flag === "-h" || flag === "--help") help = true;
    else if (flag === "--password-stdin") passwordStdin = true;
    else if (flag === "--email" || flag === "--name") {
      const given = value();
      if (given === undefined || given.startsWith("--")) {
        return { ok: false, message: `${flag} needs a value` };
      }
      if (flag === "--email") email = given;
      else name = given;
    } else {
      return { ok: false, message: `unknown argument: ${arg}` };
    }
  }
  return { ok: true, args: { email, name, passwordStdin, help } };
}

const emailSchema = z.email();

/** The email, trimmed, or a message saying what is wrong. */
export function checkAdminEmail(
  raw: string
): { ok: true; email: string } | { ok: false; message: string } {
  const email = raw.trim();
  return emailSchema.safeParse(email).success
    ? { ok: true, email }
    : { ok: false, message: `"${email}" is not an email address` };
}

/** The password, or a message saying what is wrong. Better Auth caps passwords at 128. */
export function checkAdminPassword(
  password: string
): { ok: true } | { ok: false; message: string } {
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `the password needs at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`,
    };
  }
  if (password.length > 128) {
    return { ok: false, message: "the password is longer than 128 characters" };
  }
  return { ok: true };
}

/** The name to store: the given one, else the email's local part. */
export function adminDisplayName(
  name: string | undefined,
  email: string
): string {
  const given = name?.trim() ?? "";
  return given === "" ? (email.split("@")[0] ?? email) : given;
}

/** The first line of piped input, without its line ending; the rest is ignored. */
export function firstLine(input: string): string {
  return input.split(/\r?\n/, 1)[0] ?? "";
}
