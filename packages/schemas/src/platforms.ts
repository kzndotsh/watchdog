/**
 * Known identifier platforms — suggestions + alias normalization.
 * Storage remains a free string: customs are allowed; known aliases map to canonical slugs.
 */

export interface IdentifierPlatformDef {
  slug: string;
  label: string;
  /** Lowercase aliases matched by resolveIdentifierPlatform. */
  aliases?: readonly string[];
  /** Extra hostnames for profile-URL matching (beyond `urlTemplate`). */
  hosts?: readonly string[];
  /** Profile URL — `{value}` is the cleaned handle. */
  urlTemplate?: string;
  stripSigil?: string;
}

/**
 * Default catalog. Order is picker-friendly (mainstream first, then messaging, forums, etc.).
 * Add customs freely in the UI — they are not restricted to this list.
 */
export const IDENTIFIER_PLATFORMS: readonly IdentifierPlatformDef[] = [
  // Mainstream social
  {
    slug: "twitter",
    label: "X / Twitter",
    aliases: ["x", "twitter", "twit"],
    hosts: ["twitter.com", "mobile.twitter.com"],
    urlTemplate: "https://x.com/{value}",
    stripSigil: "@",
  },
  {
    slug: "reddit",
    label: "Reddit",
    aliases: ["reddit", "r/"],
    hosts: ["old.reddit.com"],
    urlTemplate: "https://reddit.com/user/{value}",
    stripSigil: "u/",
  },
  {
    slug: "instagram",
    label: "Instagram",
    aliases: ["instagram", "ig", "insta"],
    urlTemplate: "https://instagram.com/{value}",
    stripSigil: "@",
  },
  {
    slug: "facebook",
    label: "Facebook",
    aliases: ["facebook", "fb"],
    urlTemplate: "https://facebook.com/{value}",
  },
  {
    slug: "tiktok",
    label: "TikTok",
    aliases: ["tiktok", "tik tok"],
    urlTemplate: "https://tiktok.com/@{value}",
    stripSigil: "@",
  },
  {
    slug: "youtube",
    label: "YouTube",
    aliases: ["youtube", "yt"],
    urlTemplate: "https://youtube.com/@{value}",
    stripSigil: "@",
  },
  {
    slug: "tumblr",
    label: "Tumblr",
    aliases: ["tumblr"],
    urlTemplate: "https://{value}.tumblr.com",
  },
  {
    slug: "pinterest",
    label: "Pinterest",
    aliases: ["pinterest", "pin"],
    urlTemplate: "https://pinterest.com/{value}",
    stripSigil: "@",
  },
  {
    slug: "flickr",
    label: "Flickr",
    aliases: ["flickr"],
    urlTemplate: "https://flickr.com/people/{value}",
  },
  {
    slug: "snapchat",
    label: "Snapchat",
    aliases: ["snapchat", "snap"],
    urlTemplate: "https://snapchat.com/add/{value}",
    stripSigil: "@",
  },
  {
    slug: "bluesky",
    label: "Bluesky",
    aliases: ["bluesky", "bsky"],
    urlTemplate: "https://bsky.app/profile/{value}",
    stripSigil: "@",
  },
  {
    slug: "threads",
    label: "Threads",
    aliases: ["threads"],
    urlTemplate: "https://threads.net/@{value}",
    stripSigil: "@",
  },
  {
    slug: "mastodon",
    label: "Mastodon",
    aliases: ["mastodon", "fedi", "fediverse"],
  },

  // Dev / professional
  {
    slug: "github",
    label: "GitHub",
    aliases: ["github", "gh"],
    urlTemplate: "https://github.com/{value}",
    stripSigil: "@",
  },
  {
    slug: "gitlab",
    label: "GitLab",
    aliases: ["gitlab"],
    urlTemplate: "https://gitlab.com/{value}",
    stripSigil: "@",
  },
  {
    slug: "linkedin",
    label: "LinkedIn",
    aliases: ["linkedin", "li"],
    urlTemplate: "https://linkedin.com/in/{value}",
  },
  {
    slug: "bitbucket",
    label: "Bitbucket",
    aliases: ["bitbucket"],
    urlTemplate: "https://bitbucket.org/{value}",
  },
  {
    slug: "keybase",
    label: "Keybase",
    aliases: ["keybase"],
    urlTemplate: "https://keybase.io/{value}",
  },

  // Messaging
  {
    slug: "telegram",
    label: "Telegram",
    aliases: ["telegram", "tg"],
    urlTemplate: "https://t.me/{value}",
    stripSigil: "@",
  },
  {
    slug: "discord",
    label: "Discord",
    aliases: ["discord"],
  },
  {
    slug: "signal",
    label: "Signal",
    aliases: ["signal"],
  },
  {
    slug: "whatsapp",
    label: "WhatsApp",
    aliases: ["whatsapp", "wa"],
  },
  {
    slug: "matrix",
    label: "Matrix",
    aliases: ["matrix", "mx", "element"],
  },
  {
    slug: "session",
    label: "Session",
    aliases: ["session"],
  },
  {
    slug: "wire",
    label: "Wire",
    aliases: ["wire"],
  },
  {
    slug: "wickr",
    label: "Wickr",
    aliases: ["wickr"],
  },
  {
    slug: "slack",
    label: "Slack",
    aliases: ["slack"],
  },
  {
    slug: "icq",
    label: "ICQ",
    aliases: ["icq"],
  },
  {
    slug: "skype",
    label: "Skype",
    aliases: ["skype"],
  },

  // Video / streaming
  {
    slug: "twitch",
    label: "Twitch",
    aliases: ["twitch"],
    urlTemplate: "https://twitch.tv/{value}",
  },
  {
    slug: "kick",
    label: "Kick",
    aliases: ["kick"],
    urlTemplate: "https://kick.com/{value}",
  },
  {
    slug: "peertube",
    label: "PeerTube",
    aliases: ["peertube", "fstube"],
  },
  {
    slug: "vimeo",
    label: "Vimeo",
    aliases: ["vimeo"],
    urlTemplate: "https://vimeo.com/{value}",
  },
  {
    slug: "zoom",
    label: "Zoom",
    aliases: ["zoom"],
  },

  // Gaming / other social
  {
    slug: "steam",
    label: "Steam",
    aliases: ["steam"],
    urlTemplate: "https://steamcommunity.com/id/{value}",
  },
  {
    slug: "xbox",
    label: "Xbox",
    aliases: ["xbox", "xbox live"],
  },
  {
    slug: "playstation",
    label: "PlayStation",
    aliases: ["playstation", "psn"],
  },
  {
    slug: "roblox",
    label: "Roblox",
    aliases: ["roblox"],
  },
  {
    slug: "discord_server",
    label: "Discord server",
    aliases: ["discord server", "discord invite"],
  },

  // Forums / communities
  {
    slug: "gutefrage",
    label: "GuteFrage",
    aliases: ["gutefrage", "gute frage"],
  },
  {
    slug: "throne",
    label: "Throne",
    aliases: ["throne", "throne wishlist", "wishlist"],
  },
  {
    slug: "slashdot",
    label: "Slashdot",
    aliases: ["slashdot"],
  },
  {
    slug: "hackernews",
    label: "Hacker News",
    aliases: ["hacker news", "hn", "news.ycombinator"],
  },
  {
    slug: "stackoverflow",
    label: "Stack Overflow",
    aliases: ["stack overflow", "stackoverflow", "so"],
  },

  // Email providers (often used as platform context on emails)
  {
    slug: "gmail",
    label: "Gmail",
    aliases: ["gmail", "google mail"],
  },
  {
    slug: "protonmail",
    label: "Proton Mail",
    aliases: ["protonmail", "proton mail", "proton.me", "pm.me", "proton"],
  },
  {
    slug: "fastmail",
    label: "Fastmail",
    aliases: ["fastmail", "fastmail.fm"],
  },
  {
    slug: "tutanota",
    label: "Tutanota",
    aliases: ["tutanota", "tuta", "tuta.io"],
  },
  {
    slug: "outlook",
    label: "Outlook / Hotmail",
    aliases: ["outlook", "hotmail", "live.com", "msn"],
  },
  {
    slug: "yahoo",
    label: "Yahoo",
    aliases: ["yahoo", "ymail"],
  },

  // Crypto networks (often paired with type=crypto)
  {
    slug: "bitcoin",
    label: "Bitcoin",
    aliases: ["bitcoin", "btc"],
  },
  {
    slug: "ethereum",
    label: "Ethereum",
    aliases: ["ethereum", "eth"],
  },
  {
    slug: "monero",
    label: "Monero",
    aliases: ["monero", "xmr"],
  },
] as const;

export type IdentifierPlatformSlug =
  (typeof IDENTIFIER_PLATFORMS)[number]["slug"];

const PLATFORM_BY_SLUG = new Map(
  IDENTIFIER_PLATFORMS.map((p) => [p.slug, p] as const)
);

/** Alias / slug (lowercase) → canonical slug. */
const ALIAS_TO_SLUG = new Map<string, string>();
for (const p of IDENTIFIER_PLATFORMS) {
  ALIAS_TO_SLUG.set(p.slug, p.slug);
  for (const alias of p.aliases ?? []) {
    ALIAS_TO_SLUG.set(alias.toLowerCase(), p.slug);
  }
}

export function identifierPlatformMeta(
  slug: string | null | undefined
): IdentifierPlatformDef | null {
  if (slug === null || slug === undefined || slug === "") return null;
  return PLATFORM_BY_SLUG.get(slug) ?? null;
}

/** Strip a trailing "(…)" group without regex (avoids ReDoS on free text). */
function stripTrailingParenthetical(text: string): string {
  if (!text.endsWith(")")) return text;
  const open = text.lastIndexOf("(");
  if (open <= 0) return text;
  return text.slice(0, open).trimEnd();
}

/** Custom platform slug: lowercase, spaces/junk → `_`, keep `[a-z0-9._-]`. */
function toCustomPlatformSlug(text: string): string {
  let out = "";
  let prevUnderscore = false;
  for (const ch of text.toLowerCase()) {
    const isSpace = ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
    const keep =
      (ch >= "a" && ch <= "z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "." ||
      ch === "_" ||
      ch === "-";
    if (isSpace || !keep) {
      if (!prevUnderscore && out.length > 0) {
        out += "_";
        prevUnderscore = true;
      }
      continue;
    }
    out += ch;
    prevUnderscore = ch === "_";
  }
  while (out.length > 0 && "._-".includes(out[0] ?? "")) {
    out = out.slice(1);
  }
  while (out.length > 0 && "._-".includes(out.at(-1) ?? "")) {
    out = out.slice(0, -1);
  }
  return out.slice(0, 64);
}

/** Resolve free text to a known canonical slug, or null if unknown. */
export function resolveIdentifierPlatform(text: string): string | null {
  const cleaned = text.trim().toLowerCase();
  if (!cleaned) return null;
  const exact = ALIAS_TO_SLUG.get(cleaned);
  if (exact !== undefined && exact !== "") return exact;
  // mild: "Discord (user)" style — take first token / strip parenthetical
  const bare = stripTrailingParenthetical(cleaned);
  if (bare && bare !== cleaned) {
    const viaBare = ALIAS_TO_SLUG.get(bare);
    if (viaBare !== undefined && viaBare !== "") return viaBare;
  }
  return null;
}

/**
 * Normalize for storage:
 * - blank → ""
 * - known alias → canonical slug
 * - otherwise → custom slug (lowercase, spaces→_, keep [a-z0-9._-])
 */
export function normalizeIdentifierPlatform(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const known = resolveIdentifierPlatform(trimmed);
  if (known !== null && known !== "") return known;
  return toCustomPlatformSlug(trimmed);
}

/** Slugs only — useful for AI prompts / datalists. */
export const IDENTIFIER_PLATFORM_SLUGS: readonly string[] =
  IDENTIFIER_PLATFORMS.map((p) => p.slug);

export function isKnownIdentifierPlatform(slug: string): boolean {
  return PLATFORM_BY_SLUG.has(slug);
}
