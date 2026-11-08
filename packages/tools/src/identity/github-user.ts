import { z } from "zod";

import { validationVendorError } from "../errors/vendor-errors";
import { defineJsonProvider } from "../http/define-json-provider";
import { asString } from "../parse/coerce";

export const githubUserSnapshotSchema = z.object({
  handle: z.string().min(1),
  queriedAt: z.string().min(1),
  found: z.boolean(),
  url: z.string().nullable(),
  name: z.string().nullable(),
  bio: z.string().nullable(),
  blog: z.string().nullable(),
  location: z.string().nullable(),
  company: z.string().nullable(),
  publicRepos: z.number().int().nullable(),
  followers: z.number().int().nullable(),
  createdAt: z.string().nullable(),
  status: z.number().int().nullable(),
  authenticated: z.boolean(),
});

export type GithubUserSnapshot = z.infer<typeof githubUserSnapshotSchema>;

/** Strip @ and lowercase GitHub login. */
export function normalizeGithubHandle(raw: string): string {
  const h = raw.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i.test(h)) {
    throw validationVendorError(`Invalid GitHub handle: ${raw}`);
  }
  return h;
}

/**
 * GitHub user profile via REST API.
 * Optional token raises rate limits; unauthenticated still works (public).
 */

type GithubUserOptions = {
  token?: string;
  userAgent: string;
};

function notFoundGithubSnapshot(
  handle: string,
  queriedAt: string,
  authenticated: boolean
) {
  return {
    handle,
    queriedAt,
    found: false,
    url: null,
    name: null,
    bio: null,
    blog: null,
    location: null,
    company: null,
    publicRepos: null,
    followers: null,
    createdAt: null,
    status: 404,
    authenticated,
  };
}

function githubUserFromBody(
  handle: string,
  queriedAt: string,
  body: Record<string, unknown>,
  status: number,
  authenticated: boolean
) {
  return {
    handle,
    queriedAt,
    found: true,
    url: asString(body.html_url) ?? `https://github.com/${handle}`,
    name: asString(body.name),
    bio: asString(body.bio),
    blog: asString(body.blog),
    location: asString(body.location),
    company: asString(body.company),
    publicRepos:
      typeof body.public_repos === "number" ? body.public_repos : null,
    followers: typeof body.followers === "number" ? body.followers : null,
    createdAt: asString(body.created_at),
    status,
    authenticated,
  };
}

const lookupGithubUser = defineJsonProvider({
  service: "GitHub",
  schema: githubUserSnapshotSchema,
  key: "bearer",
  normalize: normalizeGithubHandle,
  request: (handle, _options: GithubUserOptions) => ({
    url: `https://api.github.com/users/${handle}`,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  }),
  notFound: ({ subject: handle, queriedAt, options }) =>
    notFoundGithubSnapshot(handle, queriedAt, Boolean(options.token?.trim())),
  toSnapshot: ({ subject: handle, queriedAt, status, body, options }) => {
    const authenticated = Boolean(options.token?.trim());
    const login = asString(body.login);
    if (login === null) {
      return notFoundGithubSnapshot(handle, queriedAt, authenticated);
    }
    return githubUserFromBody(login, queriedAt, body, status, authenticated);
  },
});

export function fetchGithubUserEffect(
  handleRaw: string,
  signal: AbortSignal,
  options: GithubUserOptions
) {
  return lookupGithubUser(
    handleRaw,
    options.token?.trim() ?? "",
    signal,
    options
  );
}
