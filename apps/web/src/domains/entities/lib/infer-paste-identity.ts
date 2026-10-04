import {
  IDENTIFIER_PLATFORMS,
  type IdentifierType,
} from "@watchdog/schemas/shared";

export function cleanPasteCell(raw: string): string {
  let s = raw.trim().replaceAll("\u00A0", " ").trim();
  if (s.length >= 2) {
    const start = s[0];
    const end = s.at(-1);
    if (
      (start === "`" && end === "`") ||
      (start === '"' && end === '"') ||
      (start === "'" && end === "'") ||
      (start === "<" && end === ">")
    ) {
      s = s.slice(1, -1).trim();
    }
  }
  return s;
}

function looksLikePhone(value: string): boolean {
  const v = value.trim();
  if (/^tel:/i.test(v)) return true;
  if (!/^\+?[\d\s()./-]+$/.test(v)) return false;
  const digits = v.replaceAll(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return false;
  return v.startsWith("+") || /[\s()./-]/.test(v) || digits.length >= 10;
}

function looksLikeIp(value: string): boolean {
  const v = value.trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)) {
    return v.split(".").every((octet) => {
      const n = Number(octet);
      return n >= 0 && n <= 255;
    });
  }
  return v.includes(":") && /^[0-9a-f:]+$/i.test(v) && v.length >= 3;
}

function looksLikeDomain(value: string): boolean {
  return (
    !value.includes("/") &&
    !value.includes("@") &&
    !value.includes(" ") &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value)
  );
}

function matchProfileUrl(
  raw: string
): { platform: string; handle: string } | null {
  const cleaned = cleanPasteCell(raw);
  const candidate = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  for (const platform of IDENTIFIER_PLATFORMS) {
    if (platform.urlTemplate === undefined || platform.urlTemplate === "") {
      continue;
    }
    let templateUrl: URL;
    try {
      templateUrl = new URL(platform.urlTemplate.replace("{value}", "__H__"));
    } catch {
      continue;
    }
    const templateHost = templateUrl.hostname
      .replace(/^www\./, "")
      .toLowerCase();
    if (templateHost.includes("__h__")) continue;
    const hosts = new Set([templateHost, ...(platform.hosts ?? [])]);
    for (const alias of platform.aliases ?? []) {
      if (alias.includes(".")) hosts.add(alias.replace(/^www\./, ""));
    }
    if (![...hosts].some((h) => h === host || host.endsWith(`.${h}`))) {
      continue;
    }
    const prefix = (
      templateUrl.pathname.split("__H__")[0] ?? "/"
    ).toLowerCase();
    const path = url.pathname;
    if (prefix !== "/" && !path.toLowerCase().startsWith(prefix)) continue;
    let rest = path
      .slice(prefix === "/" ? 1 : prefix.length)
      .replace(/\/$/, "");
    if (rest.includes("/")) continue;
    const sigil = platform.stripSigil;
    if (sigil !== undefined && rest.startsWith(sigil)) {
      rest = rest.slice(sigil.length);
    }
    rest = rest.replace(/^@/, "");
    if (/^[A-Za-z0-9._-]+$/.test(rest)) {
      return { platform: platform.slug, handle: rest };
    }
  }
  return null;
}

export function inferPasteIdentity(raw: string): {
  type: IdentifierType | null;
  value: string;
  platform: string | null;
} {
  const v = cleanPasteCell(raw);
  if (!v) return { type: null, value: "", platform: null };

  if (/^mailto:/i.test(v)) {
    return {
      type: "email",
      value: v.replace(/^mailto:/i, "").split("?")[0] ?? v,
      platform: null,
    };
  }
  if (/^tel:/i.test(v)) {
    return { type: "phone", value: v.replace(/^tel:/i, ""), platform: null };
  }

  const profile = matchProfileUrl(v);
  if (profile !== null) {
    return {
      type: "handle",
      value: profile.handle,
      platform: profile.platform,
    };
  }

  if (v.includes("@") && v.includes(".")) {
    return { type: "email", value: v, platform: null };
  }
  if (/^@[\w.]{1,32}$/.test(v)) {
    return { type: "handle", value: v.slice(1), platform: null };
  }
  if (looksLikeIp(v)) return { type: "ip", value: v, platform: null };
  if (looksLikePhone(v)) return { type: "phone", value: v, platform: null };
  if (/^https?:\/\//i.test(v)) return { type: "url", value: v, platform: null };
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(v);
  if (!hasScheme && v.includes("/"))
    return { type: "url", value: v, platform: null };
  if (looksLikeDomain(v)) return { type: "domain", value: v, platform: null };
  return { type: null, value: v, platform: null };
}
