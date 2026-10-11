import { KEYS } from "platejs";
import type { PlateEditor } from "platejs/react";
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

function isHeadingValue(value: string | undefined): value is HeadingValue {
  return value === "h1" || value === "h2" || value === "h3";
}

function isListValue(value: string | undefined): value is ListValue {
  return value === "ul" || value === "ol";
}

export function applyListChange(
  editor: PlateEditor,
  next: string[],
  isUl: boolean,
  isOl: boolean
): void {
  const selected = next[0];
  if (isUl && selected !== "ul") {
    editor.tf.toggleBlock(KEYS.ul);
  }
  if (isOl && selected !== "ol") {
    editor.tf.toggleBlock(KEYS.ol);
  }
  if (!isListValue(selected)) {
    return;
  }
  if (selected === "ul" && !isUl) {
    editor.tf.toggleBlock(KEYS.ul);
  }
  if (selected === "ol" && !isOl) {
    editor.tf.toggleBlock(KEYS.ol);
  }
}

export function applyHeadingChange(
  editor: PlateEditor,
  next: string[],
  isH1: boolean,
  isH2: boolean,
  isH3: boolean
): void {
  const selected = next[0];
  if (isH1 && selected !== "h1") {
    editor.tf.toggleBlock(KEYS.h1);
  }
  if (isH2 && selected !== "h2") {
    editor.tf.toggleBlock(KEYS.h2);
  }
  if (isH3 && selected !== "h3") {
    editor.tf.toggleBlock(KEYS.h3);
  }
  if (!isHeadingValue(selected)) {
    return;
  }
  if (selected === "h1" && !isH1) {
    editor.tf.toggleBlock(KEYS.h1);
  }
  if (selected === "h2" && !isH2) {
    editor.tf.toggleBlock(KEYS.h2);
  }
  if (selected === "h3" && !isH3) {
    editor.tf.toggleBlock(KEYS.h3);
  }
}

export function applyMarkChange(
  editor: PlateEditor,
  next: string[],
  isBold: boolean,
  isItalic: boolean,
  isUnderline: boolean
): void {
  const wantBold = next.includes("bold");
  const wantItalic = next.includes("italic");
  const wantUnderline = next.includes("underline");
  if (wantBold !== isBold) {
    editor.tf.toggleMark(KEYS.bold);
  }
  if (wantItalic !== isItalic) {
    editor.tf.toggleMark(KEYS.italic);
  }
  if (wantUnderline !== isUnderline) {
    editor.tf.toggleMark(KEYS.underline);
  }
}
