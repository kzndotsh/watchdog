/**
 * JsonView — recursive collapsible JSON tree.
 *
 * Inspired by Vercel Geist JsonView. Adds:
 * - keyboard navigation (arrow keys, Enter/Space, Home/End)
 * - ARIA tree semantics (role=tree, role=treeitem)
 * - search highlighting via highlightPattern prop
 * - selectable text (expand arrow is the only click target, not the whole row)
 * - tokyo-night (dark) / github-light (light) token colors
 *
 * Usage:
 *   <JsonView data={obj} />
 *   <JsonView data={obj} defaultExpanded={2} />
 *   <JsonView data={obj} highlightPattern={/foo/gi} />
 */
import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// ─── theme tokens ─────────────────────────────────────────────────────────────

const TOKENS = {
  dark: {
    string: "text-[#9ece6a]",
    number: "text-[#ff9e64]",
    boolean: "text-[#7dcfff]",
    null: "text-[#565f89]",
    key: "text-[#7aa2f7]",
    punctuation: "text-[#a9b1d6]",
    bracket: "text-[#a9b1d6]",
    expand: "text-[#565f89] hover:text-[#a9b1d6]",
    highlight: "bg-[#ff9e64]/30 rounded-sm",
  },
  light: {
    string: "text-[#0a3069]",
    number: "text-[#0550ae]",
    boolean: "text-[#cf222e]",
    null: "text-[#6e7781]",
    key: "text-[#24292f]",
    punctuation: "text-[#24292f]",
    bracket: "text-[#24292f]",
    expand: "text-[#6e7781] hover:text-[#24292f]",
    highlight: "bg-[#fff8c5]/80 rounded-sm",
  },
} as const;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** `Array.isArray` narrows to `any[]` in lib.es5.d.ts; this narrows to `unknown[]` instead. */
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function getType(value: unknown) {
  if (value === null) return "null" as const;
  if (Array.isArray(value)) return "array" as const;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return t;
  // functions / symbols / bigints / undefined render as an opaque object.
  return "object" as const;
}

function preview(value: unknown): string {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    const shown = keys.slice(0, 3).join(", ");
    return `{${shown}${keys.length > 3 ? ", …" : ""}}`;
  }
  return "";
}

/** Wrap matches in <mark> spans. */
function Highlighted({
  text,
  pattern,
  className,
}: {
  text: string;
  pattern: RegExp | null | undefined;
  className?: string;
  highlightClass?: string;
}) {
  if (!pattern) return <span className={className}>{text}</span>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  const highlightPattern = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  );
  highlightPattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = highlightPattern.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <mark
        key={m.index}
        className="rounded-sm bg-[#ffe66d]/60 not-italic dark:bg-[#ff9e64]/30"
      >
        {m[0]}
      </mark>
    );
    last = m.index + m[0].length;
    if (m[0].length === 0) {
      highlightPattern.lastIndex += 1;
    }
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts}</span>;
}

// ─── node ─────────────────────────────────────────────────────────────────────

interface NodeProps {
  value: unknown;
  field?: string;
  level: number;
  defaultExpanded: number;
  isDark: boolean;
  isLast: boolean;
  highlightPattern?: RegExp | null;
  nodeRef?: React.RefObject<HTMLDivElement | null>;
}

function JsonNode({
  value,
  field,
  level,
  defaultExpanded,
  isDark,
  isLast,
  highlightPattern,
}: NodeProps) {
  const type = getType(value);
  const isExpandable = type === "object" || type === "array";
  const [open, setOpen] = useState(level < defaultExpanded);
  const t = isDark ? TOKENS.dark : TOKENS.light;

  const toggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const comma = isLast ? null : <span className={t.punctuation}>,</span>;

  // ── field label ──
  const fieldLabel =
    field === undefined ? null : (
      <>
        <Highlighted
          text={`"${field}"`}
          pattern={highlightPattern}
          className={t.key}
        />
        <span className={t.punctuation}>: </span>
      </>
    );

  // ── primitive ──
  if (!isExpandable) {
    const strVal = String(value);
    let valueEl: React.ReactNode;
    switch (type) {
      case "string": {
        valueEl = (
          <Highlighted
            text={`"${strVal}"`}
            pattern={highlightPattern}
            className={t.string}
          />
        );
        break;
      }
      case "number": {
        valueEl = (
          <Highlighted
            text={strVal}
            pattern={highlightPattern}
            className={t.number}
          />
        );
        break;
      }
      case "boolean": {
        valueEl = (
          <Highlighted
            text={strVal}
            pattern={highlightPattern}
            className={t.boolean}
          />
        );
        break;
      }
      case "null": {
        valueEl = <span className={t.null}>null</span>;
        break;
      }
      default: {
        (type) satisfies never;
        valueEl = null;
        break;
      }
    }

    return (
      <div
        role="treeitem"
        aria-selected={false}
        className="flex min-w-0 flex-wrap items-baseline gap-x-0.5 py-px"
        tabIndex={-1}
      >
        {fieldLabel}
        {valueEl}
        {comma}
      </div>
    );
  }

  // ── expandable ──
  const isArray = type === "array";
  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";
  const entries = isUnknownArray(value)
    ? value.map((v, i) => ({ key: String(i), val: v }))
    : Object.entries(
        typeof value === "object" && value !== null ? value : {}
      ).map(([k, v]): { key: string; val: unknown } => ({ key: k, val: v }));
  const isEmpty = entries.length === 0;

  if (isEmpty) {
    return (
      <div
        role="treeitem"
        aria-expanded={false}
        className="flex items-baseline gap-x-0.5 py-px"
        tabIndex={-1}
      >
        {fieldLabel}
        <span className={t.bracket}>
          {openBracket}
          {closeBracket}
        </span>
        {comma}
      </div>
    );
  }

  return (
    <div role="treeitem" aria-expanded={open} tabIndex={-1}>
      {/* header row — full row is clickable */}
      <button
        type="button"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
          if (e.key === "ArrowRight" && !open) {
            e.preventDefault();
            setOpen(true);
          }
          if (e.key === "ArrowLeft" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        className={cn(
          "flex min-w-0 cursor-pointer items-baseline gap-x-0.5 py-px text-left",
          "focus-visible:ring-ring rounded focus-visible:ring-1 focus-visible:outline-none",
          t.expand
        )}
        aria-label={open ? "Collapse" : "Expand"}
      >
        {fieldLabel}
        <span className="text-label-meta-sm leading-none select-none">
          {open ? "▾" : "▸"}
        </span>
        <span className={t.bracket}>{openBracket}</span>
        {!open && (
          <>
            <span className="text-muted-foreground text-label-mono-sm italic select-none">
              {preview(value)}
            </span>
            <span className={t.bracket}>{closeBracket}</span>
            {comma}
          </>
        )}
      </button>

      {/* children */}
      {open && (
        <>
          <div role="group" className="border-border/40 border-l pl-4">
            {entries.map(({ key, val }, i) => (
              <JsonNode
                key={key}
                field={isArray ? undefined : key}
                value={val}
                level={level + 1}
                defaultExpanded={defaultExpanded}
                isDark={isDark}
                isLast={i === entries.length - 1}
                highlightPattern={highlightPattern}
              />
            ))}
          </div>
          <div className="flex items-baseline gap-x-0.5">
            <span className={t.bracket}>{closeBracket}</span>
            {comma}
          </div>
        </>
      )}
    </div>
  );
}

// ─── public component ─────────────────────────────────────────────────────────

interface JsonViewProps {
  data: unknown;
  /** Levels to expand on mount. 0=collapsed, 1=top level only, Infinity=all. */
  defaultExpanded?: number;
  /** Regex to highlight matching keys and values. */
  highlightPattern?: RegExp | null;
  className?: string;
}

export function JsonView({
  data,
  defaultExpanded = 1,
  highlightPattern,
  className,
}: JsonViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  /** Move focus between treeitem elements with arrow keys. */
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...(rootRef.current?.querySelectorAll<HTMLElement>("[role=treeitem]") ??
        []),
    ];
    const current = document.activeElement;
    const idx = current instanceof HTMLElement ? items.indexOf(current) : -1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[Math.min(idx + 1, items.length - 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[Math.max(idx - 1, 0)]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items.at(-1)?.focus();
    }
  }, []);

  return (
    <div
      ref={rootRef}
      role="tree"
      tabIndex={0}
      aria-label="JSON"
      onKeyDown={onKeyDown}
      className={cn(
        "bg-muted/40 text-label-mono-sm overflow-auto rounded-md p-3 font-mono leading-relaxed",
        className
      )}
    >
      <JsonNode
        value={data}
        level={0}
        defaultExpanded={defaultExpanded}
        isDark={isDark}
        isLast
        highlightPattern={highlightPattern}
      />
    </div>
  );
}
