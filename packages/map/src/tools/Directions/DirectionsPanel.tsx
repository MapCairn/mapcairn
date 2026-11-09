import {
  AREA_MINUTES,
  type Bounds,
  formatArea,
  formatDistance,
  formatDuration,
  formatLatLng,
  type LatLng,
  MAX_DIRECTION_STOPS,
  routingErrorMessage,
  stopLetter,
  TRAVEL_MODES,
  type TravelMode,
  travelModeLabel,
  travelModeParticiple,
  type UnitSystem,
} from "@karta/core";
import {
  Bike,
  Car,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Footprints,
  MapPin,
  Route,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef } from "react";
import { usePreferences, useSettings } from "../../services";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { VisuallyHidden } from "../../ui/VisuallyHidden";
import { MIN_SEARCH_LENGTH, useSearch } from "../SearchPill/useSearch";
import * as styles from "./Directions.css";
import type { DirectionsOutcome, UseDirections } from "./useDirections";
import { useFreeCentre } from "./useFreeCentre";

/** The default note under the buttons that send a request. A host replaces it with one that names its service. */
export const DEFAULT_DIRECTIONS_NOTE =
  "Nothing is sent until you ask. Get route sends the stops and the way of travelling to the routing service. A travel time area sends the first stop.";

const MODE_ICONS: Readonly<Record<TravelMode, typeof Car>> = {
  drive: Car,
  walk: Footprints,
  cycle: Bike,
};

/** Props for {@link DirectionsPanel}. */
export interface DirectionsPanelProps {
  /** The directions state and actions, from `useDirections`. */
  readonly directions: UseDirections;
  /** The dropped pin, offered as a stop, or null when there is none. */
  readonly pin: LatLng | null;
  /** Returns the box to favour in the place search, usually the visible map. */
  readonly getBias?: () => Bounds | undefined;
  /**
   * What a request sends and to whom, shown under the buttons. Defaults to
   * {@link DEFAULT_DIRECTIONS_NOTE}. A host names its routing service here.
   */
  readonly note?: ReactNode;
  /** The level of the group headings, one below the sheet's title. Defaults to 3. */
  readonly headingLevel?: 3 | 4;
}

function ResultCard({
  result,
  units,
}: {
  result: DirectionsOutcome;
  units: UnitSystem;
}) {
  const how = travelModeParticiple(result.mode);
  if (result.kind === "area") {
    return (
      <div className={styles.result} data-testid="directions-result">
        <p className={styles.figures} data-testid="directions-figures">
          {result.minutes} min {how}
        </p>
        <p>
          Reaches an area of{" "}
          <span data-testid="directions-area">
            {formatArea(result.size, units)}
          </span>{" "}
          from stop A.
        </p>
      </div>
    );
  }
  return (
    <div className={styles.result} data-testid="directions-result">
      <p className={styles.figures} data-testid="directions-figures">
        {formatDistance(result.distance, units)},{" "}
        {formatDuration(result.duration)}
      </p>
      <p className={styles.hint}>
        {travelModeLabel(result.mode)}, {how}, through {result.stops.length}{" "}
        stops.
      </p>
      {result.legs.length > 1 ? (
        <ol className={styles.legList} aria-label="Legs">
          {result.legs.map((leg, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: legs are positional.
              key={index}
              data-testid="directions-leg"
            >
              {stopLetter(index)} to {stopLetter(index + 1)}:{" "}
              {formatDistance(leg.properties.distance, units)},{" "}
              {formatDuration(leg.properties.duration)}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/**
 * The directions tool's panel, for the sheet or side panel: the stops (added
 * by tapping the map, at the map centre, from a place search or from the
 * dropped pin, and reordered or removed with buttons), the way of travelling,
 * "Get route", the travel time areas and the result.
 *
 * @remarks Every action a pointer can do has a button: adding a stop at the
 *   map centre stands in for a tap on the map, and Move up, Move down and
 *   Remove stand in for any drag. "Add stop at map centre" uses the middle of
 *   the part of the map the panel leaves free, which is where the crosshair is
 *   drawn. Results and failures are announced by `useDirections`, so the
 *   panel's own text carries no live region. A request is sent only when a
 *   button asks for it, and the note under them says what goes where.
 */
export function DirectionsPanel({
  directions,
  pin,
  getBias,
  note = DEFAULT_DIRECTIONS_NOTE,
  headingLevel = 3,
}: DirectionsPanelProps) {
  const { settings } = useSettings();
  const { reducedMotion } = usePreferences();
  const search = useSearch({ getBias });
  const centre = useFreeCentre();
  const stopsHeading = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const Heading = `h${headingLevel}` as const;
  const { state, stops, mode } = directions;
  const busy = state.status === "loading";
  const full = !directions.canAddStop;
  const needsTwo = stops.length < 2;

  // A result appears below the buttons that asked for it, which on a short
  // sheet may be out of sight.
  const shown = state.status === "done" || state.status === "error";
  useEffect(() => {
    if (shown) {
      resultRef.current?.scrollIntoView?.({
        block: "nearest",
        behavior: reducedMotion ? "auto" : "smooth",
      });
    }
  }, [shown, reducedMotion]);

  const addAtCentre = () => {
    const position = centre.position();
    if (position) {
      directions.addStop(position);
    }
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    search.submit();
  };

  const remove = (id: string) => {
    directions.removeStop(id);
    stopsHeading.current?.focus();
  };

  const results = search.state.status === "results" ? search.state.results : [];

  return (
    <div className={styles.panel} data-testid="directions-panel">
      <section className={styles.group} aria-labelledby="directions-stops">
        <Heading
          id="directions-stops"
          ref={stopsHeading}
          tabIndex={-1}
          className={styles.groupHeading}
        >
          Stops
        </Heading>
        <p className={styles.hint}>
          Tap the map to add a stop, or use Add stop at map centre. Routes go
          through the stops in order.
        </p>
        {stops.length > 0 ? (
          <ol className={styles.stopList} data-testid="directions-stops">
            {stops.map((stop, index) => {
              const letter = stopLetter(index);
              return (
                <li
                  key={stop.id}
                  className={styles.stopRow}
                  data-testid="directions-stop-row"
                >
                  <span className={styles.badge} aria-hidden="true">
                    {letter}
                  </span>
                  <span className={styles.stopName}>
                    <VisuallyHidden>Stop {letter}: </VisuallyHidden>
                    {stop.label ?? formatLatLng(stop.position)}
                  </span>
                  <span className={styles.stopActions}>
                    <IconButton
                      label={`Move stop ${letter} up`}
                      icon={ChevronUp}
                      size="compact"
                      disabled={index === 0}
                      onClick={() => directions.moveStop(stop.id, -1)}
                    />
                    <IconButton
                      label={`Move stop ${letter} down`}
                      icon={ChevronDown}
                      size="compact"
                      disabled={index === stops.length - 1}
                      onClick={() => directions.moveStop(stop.id, 1)}
                    />
                    <IconButton
                      label={`Remove stop ${letter}`}
                      icon={X}
                      size="compact"
                      data-testid="directions-remove"
                      onClick={() => remove(stop.id)}
                    />
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}
        <div className={styles.actions}>
          <Button
            variant="secondary"
            icon={Crosshair}
            disabled={full}
            data-testid="directions-add-centre"
            onClick={addAtCentre}
          >
            Add stop at map centre
          </Button>
          {pin ? (
            <Button
              variant="secondary"
              icon={MapPin}
              disabled={full}
              data-testid="directions-add-pin"
              onClick={() => directions.addStop(pin, "Dropped pin")}
            >
              Add dropped pin
            </Button>
          ) : null}
        </div>
        {full ? (
          <p className={styles.hint}>
            You can add up to {MAX_DIRECTION_STOPS} stops. Remove one to add
            another.
          </p>
        ) : null}
        <form
          aria-label="Search for a stop"
          className={styles.group}
          onSubmit={submitSearch}
        >
          <div className={styles.searchRow}>
            <input
              className={styles.searchInput}
              type="text"
              aria-label="Search for a place to add as a stop"
              placeholder="Search for a place"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
              value={search.query}
              data-testid="directions-search-input"
              onChange={(event) => search.setQuery(event.target.value)}
            />
            <Button
              variant="secondary"
              type="submit"
              icon={Search}
              disabled={search.query.trim().length < MIN_SEARCH_LENGTH || full}
              busy={search.state.status === "loading"}
              data-testid="directions-search-submit"
            >
              Search
            </Button>
          </div>
          {search.state.status === "empty" ? (
            <p className={styles.hint}>Nothing matched that search.</p>
          ) : null}
          {search.state.status === "error" ? (
            <p className={styles.statusLine}>
              <Icon icon={TriangleAlert} className={styles.errorIcon} />
              <span>Search is unavailable right now. Please try again.</span>
              <Button variant="quiet" onClick={search.retry}>
                Retry
              </Button>
            </p>
          ) : null}
          {results.length > 0 ? (
            <ul
              className={styles.resultList}
              aria-label="Places found"
              data-testid="directions-search-results"
            >
              {results.map((place) => (
                <li key={place.id}>
                  <Button
                    variant="quiet"
                    data-testid="directions-search-result"
                    disabled={full}
                    onClick={() => {
                      directions.addStop(place.centre, place.label);
                      search.clear();
                    }}
                  >
                    Add {place.label}
                    {place.secondaryLabel ? `, ${place.secondaryLabel}` : ""}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      </section>

      <section className={styles.group} aria-labelledby="directions-route">
        <Heading id="directions-route" className={styles.groupHeading}>
          Route
        </Heading>
        <SegmentedControl
          label="Travel mode"
          options={TRAVEL_MODES.map((value) => ({
            value,
            label: travelModeLabel(value),
            icon: <Icon icon={MODE_ICONS[value]} />,
          }))}
          value={mode}
          onValueChange={(next) => directions.setMode(next as TravelMode)}
          data-testid="directions-mode"
        />
        <div className={styles.actions}>
          <Button
            icon={Route}
            disabled={needsTwo}
            busy={state.status === "loading" && state.request === "route"}
            data-testid="directions-get-route"
            onClick={directions.requestRoute}
          >
            Get route
          </Button>
          {busy ? (
            <Button
              variant="quiet"
              data-testid="directions-cancel"
              onClick={directions.cancel}
            >
              Cancel
            </Button>
          ) : null}
        </div>
        {needsTwo ? (
          <p className={styles.hint}>Add at least two stops to get a route.</p>
        ) : null}
      </section>

      <section className={styles.group} aria-labelledby="directions-area">
        <Heading id="directions-area" className={styles.groupHeading}>
          Travel time area
        </Heading>
        <p className={styles.hint}>
          Shows how far you can get from stop A in the time you choose.
        </p>
        <div className={styles.actions} data-testid="directions-area-actions">
          {AREA_MINUTES.map((minutes) => (
            <Button
              key={minutes}
              variant="secondary"
              disabled={stops.length < 1}
              busy={
                state.status === "loading" &&
                state.request === "area" &&
                state.minutes === minutes
              }
              aria-pressed={
                directions.result?.kind === "area" &&
                directions.result.minutes === minutes
              }
              aria-label={`Show the area reachable within ${minutes} minutes`}
              data-testid={`directions-area-${minutes}`}
              onClick={() => directions.requestArea(minutes)}
            >
              {minutes} min
            </Button>
          ))}
        </div>
        <p className={styles.hint} data-testid="directions-note">
          {note}
        </p>
      </section>

      <div ref={resultRef} data-testid="directions-status">
        {state.status === "loading" ? (
          <p className={styles.hint} data-testid="directions-loading">
            {state.request === "route"
              ? "Finding a route..."
              : "Finding the area..."}
          </p>
        ) : null}
        {state.status === "error" ? (
          <div className={styles.group} data-testid="directions-error">
            <p className={styles.statusLine}>
              <Icon icon={TriangleAlert} className={styles.errorIcon} />
              <span>{routingErrorMessage(state.kind, state.request)}</span>
            </p>
            {state.kind === "network" || state.kind === "rate-limited" ? (
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  data-testid="directions-retry"
                  onClick={directions.retry}
                >
                  Try again
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {state.status === "done" ? (
          <ResultCard result={state.result} units={settings.units} />
        ) : null}
      </div>

      {stops.length > 0 ? (
        <div className={styles.actions}>
          <Button
            variant="quiet"
            icon={Trash2}
            data-testid="directions-clear"
            onClick={directions.clear}
          >
            Clear directions
          </Button>
        </div>
      ) : null}
    </div>
  );
}
