// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import useBaseUrl from "@docusaurus/useBaseUrl";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadSearch } from "../../search/loadSearch";
import {
  excerptSegments,
  type Search,
  type SearchResult,
} from "../../search/searchEngine";
import {
  announcement,
  type IndexStatus,
  viewFor,
} from "../../search/searchState";

interface LoadedSearch {
  readonly status: IndexStatus;
  readonly search: Search | null;
}

/** One result: where it is, and the words around the match. */
function ResultItem({
  result,
  onChoose,
}: {
  result: SearchResult;
  onChoose: () => void;
}): ReactNode {
  return (
    <li>
      <a className="search-result" href={result.url} onClick={onChoose}>
        <span className="search-result__where">
          {result.heading === "" ? (
            <span className="search-result__title">{result.page}</span>
          ) : (
            <>
              <span className="search-result__page">{result.page}</span>
              <span className="search-result__title">{result.heading}</span>
            </>
          )}
        </span>
        <span className="search-result__excerpt">
          {excerptSegments(result.text, result.terms).map((segment, index) =>
            segment.match ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are a fixed run of one excerpt
              <mark key={index}>{segment.text}</mark>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are a fixed run of one excerpt
              <span key={index}>{segment.text}</span>
            ),
          )}
        </span>
      </a>
    </li>
  );
}

/**
 * The search dialog: a native modal `<dialog>`, so focus is held inside it and
 * Escape closes it. The box searches as you type; the Down arrow moves into
 * the results, which are links, and the Up arrow from the first returns to the
 * box. Enter in the box opens the first result.
 * @param props.onClose - Called when the dialog closes, by Escape, the backdrop or a chosen result.
 */
export default function SearchDialog({
  onClose,
}: {
  onClose: () => void;
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const indexUrl = useBaseUrl("search-index.json");
  const [loaded, setLoaded] = useState<LoadedSearch>({
    status: "loading",
    search: null,
  });
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  /** Whether the press that began a click was on the backdrop, so a drag that ends there does not close the dialog. */
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new attempt number is how Try again asks for another fetch
  useEffect(() => {
    let current = true;
    setLoaded({ status: "loading", search: null });
    loadSearch(indexUrl).then(
      (search) => current && setLoaded({ status: "ready", search }),
      () => current && setLoaded({ status: "error", search: null }),
    );
    return () => {
      current = false;
    };
  }, [indexUrl, attempt]);

  const results = useMemo(
    () => (loaded.search ? loaded.search(query) : []),
    [loaded.search, query],
  );
  const view = viewFor(loaded.status, query, results.length);

  const links = (): HTMLAnchorElement[] =>
    Array.from(list.current?.querySelectorAll("a") ?? []);

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      links()[0]?.focus();
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      links()[0]?.click();
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    const all = links();
    const at = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      all[Math.min(at + 1, all.length - 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (at <= 0) {
        input.current?.focus();
      } else {
        all[at - 1]?.focus();
      }
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the backdrop is a pointer shortcut; Escape and the Close button are the keyboard routes
    <dialog
      ref={dialog}
      className="search-dialog"
      aria-label="Search the documentation"
      onClose={onClose}
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === dialog.current;
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === dialog.current) {
          dialog.current?.close();
        }
      }}
    >
      <div className="search-dialog__content">
        <div className="search-dialog__bar">
          <input
            ref={input}
            className="search-dialog__input"
            type="search"
            aria-label="Search the documentation"
            placeholder="Search the documentation"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <button
            type="button"
            className="search-dialog__close"
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </div>
        <p className="search-dialog__status" role="status">
          {announcement(view, query, results.length)}
        </p>
        {view === "hint" && (
          <p className="search-dialog__message">
            Type a name, a word or a phrase. Names such as <code>MapView</code>{" "}
            come first. Press Enter to open the first result.
          </p>
        )}
        {view === "loading" && (
          <p className="search-dialog__message">Loading search…</p>
        )}
        {view === "error" && (
          <p className="search-dialog__message">
            Search could not be loaded.{" "}
            <button
              type="button"
              className="search-dialog__retry"
              onClick={() => setAttempt(attempt + 1)}
            >
              Try again
            </button>
          </p>
        )}
        {view === "empty" && (
          <p className="search-dialog__message">
            Nothing matches “{query.trim()}”. Try a shorter word, or the name of
            an export.
          </p>
        )}
        {view === "results" && (
          // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the arrow keys move between the links inside this list
          <ul
            ref={list}
            className="search-dialog__results"
            onKeyDown={onListKeyDown}
          >
            {results.map((result) => (
              <ResultItem
                key={result.id}
                result={result}
                onChoose={() => dialog.current?.close()}
              />
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
