import type { MouseEvent } from "react";

export type HeadingValue = "h1" | "h2" | "h3";
export type MarkValue = "bold" | "italic" | "underline";
export type ListValue = "ul" | "ol";

export function activeHeading(
  isH1: boolean,
  isH2: boolean,
  isH3: boolean
): HeadingValue[] {
  if (isH1) return ["h1"];
  if (isH2) return ["h2"];
  if (isH3) return ["h3"];
  return [];
}

export function activeMarks(
  isBold: boolean,
  isItalic: boolean,
  isUnderline: boolean
): MarkValue[] {
  return [
    ...(isBold ? (["bold"] as const) : []),
    ...(isItalic ? (["italic"] as const) : []),
    ...(isUnderline ? (["underline"] as const) : []),
  ];
}

export function activeList(isUl: boolean, isOl: boolean): ListValue[] {
  if (isUl) return ["ul"];
  if (isOl) return ["ol"];
  return [];
}

export function preventToolbarMouseDown(e: MouseEvent): void {
  e.preventDefault();
}
