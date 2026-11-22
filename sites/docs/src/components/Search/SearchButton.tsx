// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { ICON_SIZE, ICON_WEIGHT } from "../../iconMetrics";
import { focusIsLost } from "../../search/returnFocus";
import { isSearchShortcut } from "../../search/shortcut";

/** The dialog and the search engine load the first time search is opened, so no page pays for them before. */
const SearchDialog = lazy(() => import("./SearchDialog"));

/** Whether focus is in a field where a slash is text. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * The header's search button, which opens the search dialog. `/` and the
 * command or control key with `K` open it from anywhere on the page.
 */
export default function SearchButton(): ReactNode {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  /** The dialog gives focus back to where it was; opened with `/` from the bare page that is the body, so the button takes it. */
  const close = (): void => {
    setOpen(false);
    if (focusIsLost(document.activeElement, document)) {
      button.current?.focus();
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const pressed = {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        typing: isTyping(event.target),
      };
      if (isSearchShortcut(pressed)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="search-button"
        aria-label="Search"
        aria-haspopup="dialog"
        aria-keyshortcuts="/ Control+K Meta+K"
        onClick={() => setOpen(true)}
      >
        <MagnifyingGlass size={ICON_SIZE} weight={ICON_WEIGHT} aria-hidden />
        <span className="search-button__label">Search</span>
        <kbd className="search-button__key">/</kbd>
      </button>
      {open ? (
        <Suspense fallback={null}>
          <SearchDialog onClose={close} />
        </Suspense>
      ) : null}
    </>
  );
}
