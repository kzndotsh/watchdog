import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import {
  chordMatcher,
  hotkeyDef,
  isEditableTarget,
  matchesChord,
} from "@/shared/lib/hotkeys";
import type { ListControls } from "@/shared/lib/list/list-types";
import { CONTROL_HEIGHT, CONTROL_TEXT } from "@/shared/ui/control-chrome";
import {
  LIST_SEARCH_MIN_LENGTH,
  type AnyListDef,
} from "@watchdog/schemas/shared";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@watchdog/ui/components/input-group";
import { Kbd } from "@watchdog/ui/components/kbd";

/** The search part of a list's controls: free of the list's filter types. */
export type ListSearchControls = Pick<
  ListControls<AnyListDef>,
  "draftQ" | "setDraftQ" | "setSearchFocused" | "clearSearch"
>;

type ListSearchProps = {
  readonly controls: ListSearchControls;
  /** "Search evidence by label, notes or URL…" */
  readonly placeholder: string;
  readonly "aria-label": string;
};

const FOCUS_CHORD = chordMatcher(hotkeyDef("list-search-focus").chord);

/**
 * The list's search box: it fills the toolbar's spare width. `/` focuses it from anywhere on the
 * page outside a field (`HOTKEYS` `list-search-focus`); Escape empties it, and a second Escape
 * leaves it. With 1 or 2 characters it says "3+ characters" and sends nothing. The text is the
 * list's draft (`useList`), so what is typed is never replaced while the box has focus.
 */
export function ListSearch({
  controls,
  placeholder,
  "aria-label": ariaLabel,
}: ListSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { draftQ } = controls;
  const typed = draftQ.trim().length;
  const isTooShort = typed > 0 && typed < LIST_SEARCH_MIN_LENGTH;

  // The `/` shortcut: a window listener (external system), owned by the box it focuses.
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      if (!matchesChord(event, FOCUS_CHORD)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (draftQ === "") {
      inputRef.current?.blur();
      return;
    }
    controls.clearSearch();
  };

  return (
    <div role="search" className="flex min-w-0 flex-1 basis-56">
      <InputGroup className={`${CONTROL_HEIGHT} w-full min-w-0`}>
        <InputGroupAddon align="inline-start">
          <SearchIcon className="size-3.5" aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          // A text input with the searchbox role: the native search type adds its own clear button.
          type="text"
          role="searchbox"
          value={draftQ}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-keyshortcuts="/"
          className={CONTROL_TEXT}
          onChange={(event) => {
            controls.setDraftQ(event.target.value);
          }}
          onFocus={() => {
            controls.setSearchFocused(true);
          }}
          onBlur={() => {
            controls.setSearchFocused(false);
          }}
          onKeyDown={handleKeyDown}
        />
        <InputGroupAddon align="inline-end">
          {isTooShort ? (
            <InputGroupText className="text-2xs">
              {LIST_SEARCH_MIN_LENGTH}+ characters
            </InputGroupText>
          ) : null}
          {draftQ === "" ? (
            <Kbd aria-hidden>/</Kbd>
          ) : (
            <InputGroupButton
              size="icon-xs"
              aria-label="Clear search"
              onClick={() => {
                controls.clearSearch();
                inputRef.current?.focus();
              }}
            >
              <XIcon className="size-3.5" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
