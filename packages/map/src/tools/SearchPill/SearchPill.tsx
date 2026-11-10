import type { Bounds, SearchResult } from "@mapcairn/core";
import { ChevronRight, Search, X } from "lucide-react";
import {
  type ChangeEvent,
  type FocusEvent,
  type FocusEventHandler,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useId,
  useRef,
  useState,
} from "react";
import { useFocusTarget } from "../../chrome/focusRegistry";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { Surface } from "../../ui/Surface";
import * as styles from "./SearchPill.css";
import {
  MIN_SEARCH_LENGTH,
  SEARCH_UNAVAILABLE_MESSAGE,
  useSearch,
} from "./useSearch";

/** Props for {@link SearchPill}. */
export interface SearchPillProps {
  /** Called when the user picks a result, by click, tap or Enter. */
  readonly onSelect: (result: SearchResult) => void;
  /**
   * Returns the box to favour results inside, usually the visible map. Read
   * once when each search is submitted.
   */
  readonly getBias?: () => Bounds | undefined;
  /** Passed through from the input, for example to open the search surface. */
  readonly onFocus?: FocusEventHandler<HTMLInputElement>;
  /** Passed through from the input, for example to close the search surface. */
  readonly onBlur?: FocusEventHandler<HTMLInputElement>;
}

const NO_RESULTS: readonly SearchResult[] = [];

/** Keeps the pointer from moving focus off the input. */
function keepFocus(event: MouseEvent) {
  event.preventDefault();
}

/**
 * The floating search pill: a 48px pill holding an ARIA 1.2 combobox and a
 * Search button, with the results in a listbox just below it. It must be
 * rendered inside a `FocusRegistryProvider`, which it tells where the input is
 * so that closing the search surface can return focus to it.
 *
 * Searching happens only on submit (Enter, or the Search button), never as
 * the user types, because the OpenStreetMap Foundation's Nominatim policy
 * forbids client-side autocomplete. Editing the text hides any results for
 * the old text.
 *
 * Keyboard, following the WAI-ARIA Authoring Practices "list" combobox, with
 * the listbox filled by a submitted search:
 * - Results never take focus: the input keeps focus and
 *   `aria-activedescendant` names the active option.
 * - ArrowDown and ArrowUp move the active option, wrapping at the ends, and
 *   open a closed list that has something to show. They are the only keys
 *   that move between options.
 * - Home and End are left to the browser, so they move the caret as in any
 *   text field. When an option is active they also hand visual focus back to
 *   the text box (the active option is cleared), as the pattern describes.
 * - Enter selects the active option. With no active option it submits the
 *   text, or reopens the list when it already holds that text's results.
 * - Escape closes the list. With the list already closed, a second Escape
 *   clears the text, and a third reaches the page (closing the surface).
 *
 * Selecting a result fills the box with its label without searching again.
 * @remarks The panel is in normal flow below the pill; the chrome slot that
 *   holds this component decides where both sit. Text states in the panel
 *   ("Searching...", "Nothing matched that search.", the unavailable message)
 *   carry no live-region role, because the announcer speaks the outcome.
 */
export function SearchPill({
  onSelect,
  getBias,
  onFocus,
  onBlur,
}: SearchPillProps) {
  const search = useSearch({ getBias });
  const { query, state } = search;
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const registerFocus = useFocusTarget("search");
  const [listOpen, setListOpen] = useState(false);
  const results = state.status === "results" ? state.results : NO_RESULTS;
  const [active, setActive] = useState<{
    readonly results: readonly SearchResult[];
    readonly index: number;
  } | null>(null);

  // The active option belongs to one list of results; a new list resets it.
  const activeIndex =
    active !== null &&
    active.results === results &&
    active.index < results.length
      ? active.index
      : -1;
  const expanded = listOpen && state.status !== "idle";
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const setInputRef = useCallback(
    (element: HTMLInputElement | null) => {
      inputRef.current = element;
      registerFocus(element);
    },
    [registerFocus],
  );

  const select = (result: SearchResult) => {
    search.settle(result.label);
    setListOpen(false);
    setActive(null);
    onSelect(result);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    search.setQuery(event.target.value);
    setActive(null);
  };

  /** Searches for the text, or shows the outcome already found for it. */
  const submit = () => {
    search.submit();
    setListOpen(true);
    setActive(null);
  };

  const moveActive = (key: "ArrowDown" | "ArrowUp") => {
    const last = results.length - 1;
    const from = expanded ? activeIndex : -1;
    let next: number;
    if (key === "ArrowDown") {
      next = from >= last ? 0 : from + 1;
    } else {
      next = from <= 0 ? last : from - 1;
    }
    setActive({ results, index: next });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        if (state.status === "idle") {
          return;
        }
        event.preventDefault();
        setListOpen(true);
        if (results.length > 0) {
          moveActive(event.key);
        }
        return;
      case "Home":
      case "End":
        setActive(null);
        return;
      case "Enter": {
        event.preventDefault();
        const result = expanded ? results[activeIndex] : undefined;
        if (result) {
          select(result);
        } else {
          submit();
        }
        return;
      }
      case "Escape":
        if (expanded) {
          event.preventDefault();
          event.stopPropagation();
          setListOpen(false);
          setActive(null);
        } else if (query !== "") {
          event.preventDefault();
          event.stopPropagation();
          search.clear();
        }
        return;
      default:
    }
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setListOpen(true);
    onFocus?.(event);
  };

  const handleRootBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setListOpen(false);
      setActive(null);
    }
  };

  const handleClear = () => {
    search.clear();
    setListOpen(false);
    setActive(null);
    inputRef.current?.focus();
  };

  const handleSubmitClick = () => {
    submit();
    inputRef.current?.focus();
  };

  const handleRetry = () => {
    search.retry();
    inputRef.current?.focus();
  };

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the blur handler only closes the list when focus leaves the search; it adds no interaction of its own
    // biome-ignore lint/a11y/useSemanticElements: the search landmark is requested with role="search" and a name
    <div
      role="search"
      aria-label="Search"
      className={styles.root}
      data-chrome="search-pill"
      data-testid="search-pill"
      onBlur={handleRootBlur}
    >
      <Surface radius="pill" className={styles.pill}>
        <input
          ref={setInputRef}
          className={styles.input}
          type="text"
          role="combobox"
          aria-label="Search places"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-activedescendant={
            expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Search places"
          value={query}
          data-testid="location-search-input"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={onBlur}
        />
        {query !== "" ? (
          <IconButton
            label="Clear search"
            icon={X}
            size="compact"
            data-testid="location-search-clear"
            onMouseDown={keepFocus}
            onClick={handleClear}
          />
        ) : null}
        <IconButton
          label="Search"
          icon={Search}
          size="compact"
          disabled={query.trim().length < MIN_SEARCH_LENGTH}
          busy={state.status === "loading"}
          data-testid="location-search-submit"
          onMouseDown={keepFocus}
          onClick={handleSubmitClick}
        />
      </Surface>
      <Surface
        variant="floating"
        radius="control"
        className={styles.panel}
        hidden={!expanded}
        data-chrome="search-results"
        data-testid="location-search-panel"
      >
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className={styles.listbox}
          data-testid="location-search-results"
        >
          {results.map((result, index) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard selection happens on the combobox input, which keeps focus
            // biome-ignore lint/a11y/useFocusableInteractive: options are never focused; the input names the active one with aria-activedescendant
            <div
              key={result.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={styles.option}
              data-testid="location-search-option"
              onMouseDown={keepFocus}
              onClick={() => select(result)}
            >
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{result.label}</span>
                {result.secondaryLabel ? (
                  <span className={styles.optionSecondary}>
                    {result.secondaryLabel}
                  </span>
                ) : null}
              </span>
              {index === activeIndex ? (
                <Icon icon={ChevronRight} className={styles.chevron} />
              ) : null}
            </div>
          ))}
        </div>
        {state.status === "loading" ? (
          <div className={styles.message}>Searching...</div>
        ) : null}
        {state.status === "empty" ? (
          <div className={styles.message}>Nothing matched that search.</div>
        ) : null}
        {state.status === "error" ? (
          <div className={styles.message}>
            <span>{SEARCH_UNAVAILABLE_MESSAGE}</span>
            <Button
              variant="quiet"
              data-testid="location-search-retry"
              onMouseDown={keepFocus}
              onClick={handleRetry}
            >
              Retry
            </Button>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}
