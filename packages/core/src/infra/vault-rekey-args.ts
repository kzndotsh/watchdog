export const OLD_KEY_ENV = "WD_MASTER_VAULT_KEY_OLD";

export const VAULT_REKEY_USAGE = `Usage: vault-rekey [--old-key-stdin]

Re-encrypts every stored Cap credential from the OLD master key to the new one, all or
nothing, in one transaction. The new key is the WD_MASTER_VAULT_KEY of the environment you
run it in. The old key is never a command-line argument (it would land in shell history and
process lists):

  ${OLD_KEY_ENV}=<old key>   read from the environment (default)
  --old-key-stdin                 read the first line of stdin instead

The old key may be a placeholder or short: it is only checked by decrypting with it. Nothing is
written unless every credential opens under it. Back up the database first. After it succeeds,
restart web and worker so they run with the new key.

In the container:  docker compose --env-file .env.production -f docker-compose.prod.yml \\
                     run --rm --no-deps -e ${OLD_KEY_ENV} web node vault-rekey.mjs
Locally:           ${OLD_KEY_ENV}=<old key> just vault-rekey`;

export type RekeyArgs = {
  readonly oldKeyStdin: boolean;
  readonly help: boolean;
};

export type ParsedRekeyArgs =
  | { readonly ok: true; readonly args: RekeyArgs }
  | { readonly ok: false; readonly message: string };

/** Parse the flags. A key given as an argument is refused by name, not just as unknown. */
export function parseRekeyArgs(argv: readonly string[]): ParsedRekeyArgs {
  let oldKeyStdin = false;
  let help = false;
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") help = true;
    else if (arg === "--old-key-stdin") oldKeyStdin = true;
    else if (/^--(old|new)?-?key/.test(arg)) {
      return {
        ok: false,
        message: `keys are never passed as arguments (${arg.split("=")[0]}): set ${OLD_KEY_ENV} or use --old-key-stdin`,
      };
    } else return { ok: false, message: `unknown argument: ${arg}` };
  }
  return { ok: true, args: { oldKeyStdin, help } };
}

/**
 * The old master key: stdin's first line with `--old-key-stdin`, else the environment.
 * Validated only as non-empty: it may be a placeholder or short, which is the case rotation
 * exists for.
 */
export function resolveOldKey(input: {
  readonly oldKeyStdin: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly readStdin: () => string;
}): { ok: true; key: string } | { ok: false; message: string } {
  const raw = input.oldKeyStdin
    ? (input.readStdin().split(/\r?\n/, 1)[0] ?? "")
    : (input.env[OLD_KEY_ENV] ?? "");
  const key = raw.trim();
  if (key === "") {
    return {
      ok: false,
      message: input.oldKeyStdin
        ? "stdin held no old key"
        : `${OLD_KEY_ENV} is not set (or empty): set it to the key the credentials are encrypted under now`,
    };
  }
  return { ok: true, key };
}
