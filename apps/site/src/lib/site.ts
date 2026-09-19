export const GITHUB_URL = "https://github.com/kzndotsh/watchdog";

export const DOCS_URL =
  "https://github.com/kzndotsh/watchdog/blob/main/docs/README.md";

const DEFAULT_APP_URL = "http://127.0.0.1:3000";

export function appUrl(path: string): string {
  const base = import.meta.env.PUBLIC_APP_URL || DEFAULT_APP_URL;
  return new URL(path, base).href;
}

export const SIGN_IN_URL = appUrl("/auth/sign-in");
