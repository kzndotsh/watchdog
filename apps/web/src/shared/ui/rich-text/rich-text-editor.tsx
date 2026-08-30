import { MarkdownPlugin } from "@platejs/markdown";
import {
  Plate,
  PlateContent,
  PlateContainer,
  usePlateEditor,
} from "platejs/react";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { cn } from "@/lib/utils";
import { RichTextEditorPlugins } from "@/shared/ui/rich-text/plugins";
import { RichTextToolbar } from "@/shared/ui/rich-text/rich-text-toolbar";

interface Props {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** Accessible name when placeholder is omitted (dossier Summary/Notes). */
  ariaLabel?: string;
  className?: string;
  editorKey?: string | number;
  variant?: "default" | "seamless";
  toolbar?: "always" | "focus";
  disabled?: boolean;
  /** Stretch to fill a flex parent (Notes tab). */
  fill?: boolean;
  /** Shell blur after toolbar clicks settle — used for autosave. */
  onBlurShell?: () => void;
}

function shellMinHeight(fill: boolean, seamless: boolean): string {
  if (fill) return "min-h-0 flex-1";
  if (seamless) return "min-h-[7.5rem]";
  return "min-h-[8.75rem]";
}

function isSlateContentTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest("[data-slate-node]") !== null
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  editorKey,
  variant = "default",
  toolbar = "always",
  disabled = false,
  fill = false,
  onBlurShell,
}: Props) {
  const [focused, setFocused] = useState(false);
  const showToolbar = toolbar === "always" || focused;
  const lastEmittedRef = useRef(value || "");
  const blurTimerRef = useRef<number | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const editor = usePlateEditor(
    {
      plugins: RichTextEditorPlugins,
      value: (ed) =>
        ed.getApi(MarkdownPlugin).markdown.deserialize(value || ""),
    },
    [editorKey]
  );

  useEffect(
    () => () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
    },
    []
  );

  const seamless = variant === "seamless";
  const editorAriaLabel = ariaLabel ?? placeholder ?? "Rich text editor";

  function handleSurfaceMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (disabled || isSlateContentTarget(e.target)) return;
    // Empty padding below blocks is not contenteditable — focus like a textarea.
    e.preventDefault();
    editor.tf.focus({ edge: "endEditor" });
  }

  return (
    <div
      ref={shellRef}
      className={cn(
        "bg-background flex flex-col overflow-hidden",
        seamless
          ? "border-border focus-within:border-ring/60 rounded-md border"
          : "border-input rounded-md border",
        shellMinHeight(fill, seamless),
        className
      )}
      data-slot="rich-text-editor"
      onFocusCapture={() => {
        if (blurTimerRef.current !== null) {
          window.clearTimeout(blurTimerRef.current);
          blurTimerRef.current = null;
        }
        setFocused(true);
      }}
      onBlurCapture={(e) => {
        const next = e.relatedTarget;
        if (next instanceof Node && e.currentTarget.contains(next)) {
          return;
        }
        if (blurTimerRef.current !== null) {
          window.clearTimeout(blurTimerRef.current);
        }
        blurTimerRef.current = window.setTimeout(() => {
          blurTimerRef.current = null;
          const active = document.activeElement;
          if (shellRef.current?.contains(active)) {
            return;
          }
          setFocused(false);
          onBlurShell?.();
        }, 0);
      }}
    >
      <Plate
        editor={editor}
        readOnly={disabled}
        onChange={() => {
          const contentOps = editor.operations.filter(
            (op) => op.type !== "set_selection"
          );
          if (contentOps.length === 0) {
            return;
          }
          const next = editor.api.markdown.serialize().trimEnd();
          if (next === lastEmittedRef.current) {
            return;
          }
          lastEmittedRef.current = next;
          onChange(next);
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className={cn(
              "shrink-0",
              showToolbar
                ? "block"
                : "pointer-events-none invisible absolute h-0 overflow-hidden opacity-0"
            )}
            aria-hidden={!showToolbar}
          >
            <RichTextToolbar />
          </div>
          <div
            role="textbox"
            tabIndex={-1}
            aria-multiline="true"
            aria-label={editorAriaLabel}
            aria-readonly={disabled || undefined}
            className={cn(
              "min-h-0 flex-1 cursor-text overflow-y-auto",
              !fill && !seamless && "max-h-[320px]"
            )}
            onMouseDown={handleSurfaceMouseDown}
          >
            <PlateContainer className="h-full min-h-full rounded-none border-0">
              <PlateContent
                placeholder={placeholder}
                className="h-full min-h-full cursor-text px-3 py-2 text-sm leading-relaxed outline-none"
              />
            </PlateContainer>
          </div>
        </div>
      </Plate>
    </div>
  );
}
