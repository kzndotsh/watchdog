export type FilenameForensicHit = {
  label: string;
  detail: string;
};

const RULES: {
  label: string;
  re: RegExp;
  extra?: (m: RegExpExecArray) => string;
}[] = [
  { label: "iOS camera roll", re: /\bIMG_\d{4}\./i },
  { label: "Android capture timestamp", re: /\b\d{8}_\d{6}\b/ },
  { label: "Pixel capture", re: /\bPXL_\d{8}_\d{9}/ },
  { label: "Android screenshot", re: /Screenshot[_ -]\d{4}-?\d{2}-?\d{2}/i },
  { label: "Photoshop Express", re: /\bPSX_\d{8}_\d{6}/ },
  {
    label: "Facebook app save",
    re: /\bFB_IMG_(\d{13})/i,
    extra: (m) => {
      const ms = Number(m[1]);
      if (!Number.isFinite(ms)) return m[0] ?? "";
      return new Date(ms).toISOString();
    },
  },
  { label: "Meta CDN media id", re: /\b\d{8,}_(\d{15,})_\d{15,}_n\b/ },
  { label: "IG ripper", re: /(SnapInsta|ssstik|savefrom)/i },
  {
    label: "source app named",
    re: /Screenshot[^.]*?_(Instagram|Google|Gallery|Chrome|Facebook|Telegram|WhatsApp)/i,
  },
  { label: "android package", re: /com[._][a-z0-9_.]+/i },
];

export function filenameFromUrlOrLabel(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, "");
    const slash = path.lastIndexOf("/");
    const last = slash === -1 ? path : path.slice(slash + 1);
    if (last !== "") return decodeURIComponent(last);
  } catch {
    // not a URL — treat as a filename
  }
  return trimmed.split(/[/\\]/).at(-1) ?? trimmed;
}

/** Device / OS / capture-date hints from an original filename. */
export function describeFilenameForensics(
  filename: string
): FilenameForensicHit | null {
  const base = filenameFromUrlOrLabel(filename);
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const m = rule.re.exec(base);
    if (!m) continue;
    const extra = rule.extra?.(m);
    return {
      label: rule.label,
      detail: extra && extra !== "" ? `${m[0]} → ${extra}` : (m[0] ?? base),
    };
  }
  return null;
}
