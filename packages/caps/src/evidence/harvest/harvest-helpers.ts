import type { ProcessExtractDraft } from "@watchdog/ai";
import {
  normalizeIdentifierPlatform,
  normalizeIdentifierValue,
  type IdentifierType,
} from "@watchdog/schemas";

import * as P from "./harvest-patterns";

export type DraftId = ProcessExtractDraft["identifiers"][number];
export type DraftClaim = ProcessExtractDraft["claims"][number];

function uniqKey(type: string, platform: string, value: string): string {
  return `${type}|${platform}|${value.toLowerCase()}`;
}

export function isJunkEmail(email: string): boolean {
  const e = email.toLowerCase();
  if (P.JUNK_EMAIL_PREFIXES.some((p) => e.startsWith(p))) return true;
  return P.JUNK_EMAIL_DOMAINS.some(
    (d) => e.endsWith(`@${d}`) || e.endsWith(`.${d}`)
  );
}

export function stripZeroWidth(text: string): string {
  return text.replace(P.ZERO_WIDTH, "");
}

function leetRaw(text: string): string {
  let s = stripZeroWidth(text);
  s = s.replaceAll("|-|", "h").replaceAll("[]", "o").replaceAll("()", "o");
  let out = "";
  for (const ch of s) {
    out += P.LEET_SINGLE[ch] ?? ch;
  }
  return out;
}

export function normalizeLeetForEmails(text: string): string {
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(P.URL_RE)) {
    const start = m.index ?? 0;
    parts.push(leetRaw(text.slice(last, start)), m[0] ?? "");
    last = start + (m[0]?.length ?? 0);
  }
  parts.push(leetRaw(text.slice(last)));
  return parts.join("");
}

function canonicalizeObfuscatedEmail(raw: string): string | null {
  let norm = raw
    .replaceAll(/\s*[[(]?\s*(?:at|AT|@)\s*[\])]?\s*/g, "@")
    .replaceAll(/\s*[[(]?\s*(?:dot|DOT|\.)\s*[\])]?\s*/g, ".")
    .replaceAll(/\s*\[at\]\s*/gi, "@")
    .replaceAll(/\s*\[dot\]\s*/gi, ".")
    .trim()
    .toLowerCase();
  if (norm.includes("|")) {
    const bits = norm.split("|");
    if (bits.length === 3) {
      norm = `${bits[0]}@${bits[1]}.${bits[2]}`;
    }
  }
  if (!norm.includes("@")) return null;
  const domain = norm.split("@")[1] ?? "";
  if (!domain.includes(".")) return null;
  if (isJunkEmail(norm)) return null;
  return norm;
}

export function validBtc(addr: string): boolean {
  if (/^[0-9a-f]{25,40}$/i.test(addr)) return false;
  if (new Set(addr).size < P.BTC_MIN_UNIQUE) return false;
  if (addr.startsWith("bc1")) return true;
  const body = addr.slice(1);
  return /\d/.test(body) && /[A-Z]/.test(body) && /[a-z]/.test(body);
}

export function validLtc(addr: string): boolean {
  const body = addr.slice(1);
  const unique = new Set(body).size;
  return (
    /\d/.test(body) &&
    /[A-Z]/.test(body) &&
    /[a-z]/.test(body) &&
    unique >= P.LTC_MIN_UNIQUE
  );
}

export function isPublicIpv4(ip: string): boolean {
  if (ip.startsWith("127.") || ip.startsWith("0.") || ip.startsWith("255.")) {
    return false;
  }
  if (ip.startsWith("192.168.") || ip.startsWith("10.")) return false;
  if (ip.startsWith("169.254.")) return false;
  if (ip.startsWith("100.")) {
    const second = Number(ip.split(".")[1]);
    if (second >= 64 && second <= 127) return false;
  }
  if (ip.startsWith("172.")) {
    const second = Number(ip.split(".")[1]);
    if (second >= 16 && second <= 31) return false;
  }
  return true;
}

function quoteAround(text: string, value: string): string | undefined {
  const idx = text.toLowerCase().indexOf(value.toLowerCase());
  if (idx === -1) return undefined;
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + value.length + 40);
  return text.slice(start, end).replaceAll(/\s+/g, " ").trim();
}

export function pushId(
  list: DraftId[],
  seen: Set<string>,
  type: IdentifierType,
  value: string,
  sourceText: string,
  opts?: {
    platform?: string;
    notes?: string;
    quoteNeedle?: string;
  }
) {
  const platform =
    opts?.platform !== undefined && opts.platform !== ""
      ? normalizeIdentifierPlatform(opts.platform)
      : "";
  const normalized = normalizeIdentifierValue(type, value);
  const key = uniqKey(type, platform, normalized);
  if (seen.has(key)) return;
  const typeCount = list.filter((i) => i.type === type).length;
  if (typeCount >= P.MAX_PER_TYPE) return;
  seen.add(key);
  const needle = opts?.quoteNeedle ?? value;
  list.push({
    type,
    value: normalized,
    ...(platform ? { platform } : {}),
    ...(opts?.notes !== undefined && opts.notes !== ""
      ? { notes: opts.notes }
      : {}),
    evidenceQuote: quoteAround(sourceText, needle),
  });
}

export function pushQuestion(
  list: ProcessExtractDraft["questions"],
  seen: Set<string>,
  text: string,
  sourceText: string,
  quoteNeedle?: string
) {
  const key = `question|${text.toLowerCase()}`;
  if (seen.has(key) || list.length >= P.MAX_PER_TYPE) return;
  seen.add(key);
  list.push({
    text,
    evidenceQuote: quoteAround(sourceText, quoteNeedle ?? text),
  });
}

export function pushClaim(
  list: DraftClaim[],
  seen: Set<string>,
  text: string,
  sourceText: string,
  quoteNeedle?: string
) {
  const key = `claim|${text.toLowerCase()}`;
  if (seen.has(key) || list.length >= P.MAX_PER_TYPE) return;
  seen.add(key);
  list.push({
    text,
    class: "observation",
    evidenceQuote: quoteAround(sourceText, quoteNeedle ?? text),
  });
}

export function collectEmails(
  text: string,
  list: DraftId[],
  seen: Set<string>,
  sourceText: string,
  fediSkip: Set<string>
) {
  for (const m of text.matchAll(P.EMAIL_RE)) {
    const raw = m[0] ?? "";
    const norm = raw.toLowerCase();
    if (fediSkip.has(norm)) continue;
    if (/\.(png|jpe?g|gif|webp|html?)$/i.test(norm)) continue;
    if (isJunkEmail(norm)) continue;
    pushId(list, seen, "email", norm, sourceText, { quoteNeedle: raw });
  }
  for (const re of [
    P.EMAIL_OBFUSCATED_RE,
    P.EMAIL_BRACKET_RE,
    P.EMAIL_PIPE_RE,
  ]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const raw = m[0] ?? "";
      const norm = canonicalizeObfuscatedEmail(raw);
      if (norm === null) continue;
      pushId(list, seen, "email", norm, sourceText, {
        notes: "obfuscated",
        quoteNeedle: raw,
      });
    }
  }
}

export function labeledHandle(
  list: DraftId[],
  seen: Set<string>,
  sourceText: string,
  re: RegExp,
  platform: string,
  opts?: { asPhone?: boolean; lowercase?: boolean; notes?: string }
) {
  re.lastIndex = 0;
  for (const m of sourceText.matchAll(re)) {
    const raw = m[0] ?? "";
    const captured = m[1] ?? raw;
    if (opts?.asPhone === true) {
      pushId(list, seen, "phone", captured, sourceText, {
        platform,
        notes: opts?.notes,
        quoteNeedle: raw,
      });
      continue;
    }
    const value = opts?.lowercase === false ? captured : captured.toLowerCase();
    pushId(list, seen, "handle", value, sourceText, {
      platform,
      notes: opts?.notes,
      quoteNeedle: raw,
    });
  }
}
