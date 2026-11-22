// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useLocation } from "@docusaurus/router";
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
import { focusIsLost, sameDocumentTarget } from "../../search/returnFocus";
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
 * Moves keyboard focus to the element with an id, giving it a tab index of -1
 * until focus leaves it when it is not focusable already, as a heading is not.
 * @returns Whether there was such an element.
 */
function focusTarget(id: string): boolean {
  const target = document.getElementById(id);
  if (!target) {
    return false;
  }
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), {
      once: true,
    });
  }
  target.focus();
  return true;
}

/**
 * The header's search button, which opens the search dialog. `/` and the
 * command or control key with `K` open it from anywhere on the page.
 */
export default function SearchButton(): ReactNode {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const button = useRef<HTMLButtonElement>(null);

  /**
   * The dialog gives focus back to where it was. A result on the page being
   * read only scrolls, so focus goes to its heading; opened with `/` from the
   * bare page focus would be the body, so the button takes it.
   */
  const close = (chosen: string | null): void => {
    setOpen(false);
    const id =
      chosen === null ? null : sameDocumentTarget(chosen, { pathname });
    if (id !== null && focusTarget(id)) {
      return;
    }
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
