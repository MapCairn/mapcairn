// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  AREA_MINUTES,
  type Bounds,
  formatArea,
  formatDistance,
  formatDuration,
  formatLatLng,
  type LatLng,
  MAX_DIRECTION_STOPS,
  message,
  routingErrorMessage,
  stopLetter,
  TRAVEL_MODES,
  type TravelMode,
  travelModeLabel,
  travelModeParticiple,
  type UnitSystem,
} from "@mapcairn/core";
import {
  Bicycle,
  Car,
  CaretDown,
  CaretUp,
  Crosshair,
  Footprints,
  MagnifyingGlass,
  MapPin,
  Path,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import {
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useId,
  useRef,
} from "react";
import {
  useFormatMessage,
  useMessages,
  usePreferences,
  useSettings,
} from "../../services";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { fillSlots, Isolate } from "../../ui/Isolate";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { VisuallyHidden } from "../../ui/VisuallyHidden";
import { MIN_SEARCH_LENGTH, useSearch } from "../SearchPill/useSearch";
import * as styles from "./Directions.css";
import type { DirectionsOutcome, UseDirections } from "./useDirections";
import { useFreeCentre } from "./useFreeCentre";

const MODE_ICONS: Readonly<Record<TravelMode, typeof Car>> = {
  drive: Car,
  walk: Footprints,
  cycle: Bicycle,
};

/** Props for {@link DirectionsPanel}. */
export interface DirectionsPanelProps {
  /** The directions state and actions, from `useDirections`. */
  readonly directions: UseDirections;
  /** The dropped pin, offered as a stop, or null when there is none. */
  readonly pin: LatLng | null;
  /**
   * Returns the box to favour in the place search, usually the visible map.
   * Optional, and passed to {@link useSearch}, whose note on what a bias
   * sends applies.
   */
  readonly getBias?: () => Bounds | undefined;
  /**
   * What a request sends and to whom, shown under the buttons. Defaults to
   * the catalogue's `tools.directions.note`, which does not name the service.
   * A host names its routing service here.
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
  const messages = useMessages();
  const { t } = messages;
  const format = useFormatMessage();
  const how = travelModeParticiple(result.mode);
  if (result.kind === "area") {
    return (
      <div className={styles.result} data-testid="directions-result">
        <p className={styles.figures} data-testid="directions-figures">
          {fillSlots(
            t("common.followedBy", {
              first: "{minutes}",
              second: format(how),
            }),
            {
              minutes: (
                <Isolate>
                  {format(
                    message("duration.short.minute", {
                      count: result.minutes,
                    }),
                  )}
                </Isolate>
              ),
            },
          )}
        </p>
        <p>
          {fillSlots(t("tools.directions.reachesArea", { area: "{area}" }), {
            area: (
              <span data-testid="directions-area">
                <Isolate>{formatArea(result.size, units, messages)}</Isolate>
              </span>
            ),
          })}
        </p>
      </div>
    );
  }
  return (
    <div className={styles.result} data-testid="directions-result">
      <p className={styles.figures} data-testid="directions-figures">
        {fillSlots(
          t("common.commaJoined", {
            first: "{distance}",
            second: "{duration}",
          }),
          {
            distance: (
              <Isolate>
                {formatDistance(result.distance, units, messages)}
              </Isolate>
            ),
            duration: (
              <Isolate>{format(formatDuration(result.duration))}</Isolate>
            ),
          },
        )}
      </p>
      <p className={styles.hint}>
        {messages.plural("tools.directions.routeSummary", {
          mode: format(travelModeLabel(result.mode)),
          how: format(how),
          count: result.stops.length,
        })}
      </p>
      {result.legs.length > 1 ? (
        <ol
          className={styles.legList}
          aria-label={t("tools.directions.legs", {})}
        >
          {result.legs.map((leg, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: legs are positional.
              key={index}
              data-testid="directions-leg"
            >
              {fillSlots(
                t("tools.directions.leg", {
                  from: stopLetter(index),
                  to: stopLetter(index + 1),
                  distance: "{distance}",
                  duration: "{duration}",
                }),
                {
                  distance: (
                    <Isolate>
                      {formatDistance(leg.properties.distance, units, messages)}
                    </Isolate>
                  ),
                  duration: (
                    <Isolate>
                      {format(formatDuration(leg.properties.duration))}
                    </Isolate>
                  ),
                },
              )}
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
  note,
  headingLevel = 3,
}: DirectionsPanelProps) {
  const { settings } = useSettings();
  const format = useFormatMessage();
  const messages = useMessages();
  const { t } = messages;
  const { reducedMotion } = usePreferences();
  const search = useSearch({ getBias });
  const centre = useFreeCentre();
  const stopsHeading = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const Heading = `h${headingLevel}` as const;
  const stopsId = useId();
  const routeId = useId();
  const searchId = useId();
  const areaId = useId();
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

  const submitSearch = (event: SyntheticEvent) => {
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
      <section className={styles.group} aria-labelledby={stopsId}>
        <Heading
          id={stopsId}
          ref={stopsHeading}
          tabIndex={-1}
          className={styles.groupHeading}
        >
          {t("tools.directions.stops", {})}
        </Heading>
        <p className={styles.hint}>{t("tools.directions.stopsHint", {})}</p>
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
                    <VisuallyHidden>
                      {t("tools.directions.stopPrefix", { letter })}{" "}
                    </VisuallyHidden>
                    {stop.label === undefined ? (
                      <Isolate figure>{formatLatLng(stop.position)}</Isolate>
                    ) : (
                      <Isolate>{stop.label}</Isolate>
                    )}
                  </span>
                  <span className={styles.stopActions}>
                    <IconButton
                      label={t("tools.directions.moveUp", { letter })}
                      icon={CaretUp}
                      size="compact"
                      disabled={index === 0}
                      onClick={() => directions.moveStop(stop.id, -1)}
                    />
                    <IconButton
                      label={t("tools.directions.moveDown", { letter })}
                      icon={CaretDown}
                      size="compact"
                      disabled={index === stops.length - 1}
                      onClick={() => directions.moveStop(stop.id, 1)}
                    />
                    <IconButton
                      label={t("tools.directions.remove", { letter })}
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
            {t("tools.directions.addAtCentre", {})}
          </Button>
          {pin ? (
            <Button
              variant="secondary"
              icon={MapPin}
              disabled={full}
              data-testid="directions-add-pin"
              onClick={() =>
                directions.addStop(pin, t("tools.directions.droppedPin", {}))
              }
            >
              {t("tools.directions.addPin", {})}
            </Button>
          ) : null}
        </div>
        {full ? (
          <p className={styles.hint}>
            {t("tools.directions.full", { max: MAX_DIRECTION_STOPS })}
          </p>
        ) : null}
      </section>

      <section className={styles.group} aria-labelledby={routeId}>
        {/* The controls name themselves, and the room matters on a half-height sheet. */}
        <VisuallyHidden as={Heading} id={routeId}>
          {t("tools.directions.route", {})}
        </VisuallyHidden>
        <SegmentedControl
          label={t("tools.directions.travelMode", {})}
          options={TRAVEL_MODES.map((value) => ({
            value,
            label: format(travelModeLabel(value)),
            icon: <Icon icon={MODE_ICONS[value]} />,
          }))}
          value={mode}
          onValueChange={(next) => directions.setMode(next as TravelMode)}
          data-testid="directions-mode"
        />
        <div className={styles.actions}>
          <Button
            icon={Path}
            disabled={needsTwo}
            busy={state.status === "loading" && state.request === "route"}
            data-testid="directions-get-route"
            onClick={directions.requestRoute}
          >
            {t("tools.directions.getRoute", {})}
          </Button>
          {busy ? (
            <Button
              variant="quiet"
              data-testid="directions-cancel"
              onClick={directions.cancel}
            >
              {t("tools.directions.cancel", {})}
            </Button>
          ) : null}
        </div>
        {needsTwo ? (
          <p className={styles.hint}>{t("tools.directions.needTwo", {})}</p>
        ) : null}
      </section>

      <section className={styles.group} aria-labelledby={searchId}>
        <Heading id={searchId} className={styles.groupHeading}>
          {t("tools.directions.searchHeading", {})}
        </Heading>
        <form
          aria-label={t("tools.directions.searchForm", {})}
          className={styles.group}
          onSubmit={submitSearch}
        >
          <div className={styles.searchRow}>
            <input
              className={styles.searchInput}
              type="text"
              aria-label={t("tools.directions.searchInput", {})}
              placeholder={t("tools.directions.searchPlaceholder", {})}
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
              icon={MagnifyingGlass}
              disabled={search.query.trim().length < MIN_SEARCH_LENGTH || full}
              busy={search.state.status === "loading"}
              data-testid="directions-search-submit"
            >
              {t("tools.search.label", {})}
            </Button>
          </div>
          {search.state.status === "empty" ? (
            <p className={styles.hint}>
              {t("tools.search.nothingMatched", {})}
            </p>
          ) : null}
          {search.state.status === "error" ? (
            <p className={styles.statusLine}>
              <Icon icon={Warning} className={styles.errorIcon} />
              <span>{t("tools.search.unavailable", {})}</span>
              <Button variant="quiet" onClick={search.retry}>
                {t("tools.search.retry", {})}
              </Button>
            </p>
          ) : null}
          {results.length > 0 ? (
            <ul
              className={styles.resultList}
              aria-label={t("tools.directions.placesFound", {})}
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
                    {t("tools.directions.addPlace", {
                      place: place.secondaryLabel
                        ? t("common.commaJoined", {
                            first: place.label,
                            second: place.secondaryLabel,
                          })
                        : place.label,
                    })}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      </section>

      <section className={styles.group} aria-labelledby={areaId}>
        <Heading id={areaId} className={styles.groupHeading}>
          {t("tools.directions.areaHeading", {})}
        </Heading>
        <p className={styles.hint}>{t("tools.directions.areaHint", {})}</p>
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
              aria-label={messages.plural("tools.directions.showArea", {
                count: minutes,
              })}
              data-testid={`directions-area-${minutes}`}
              onClick={() => directions.requestArea(minutes)}
            >
              {messages.plural("duration.short.minute", { count: minutes })}
            </Button>
          ))}
        </div>
        <p className={styles.hint} data-testid="directions-note">
          {note ?? t("tools.directions.note", {})}
        </p>
      </section>

      <div ref={resultRef} data-testid="directions-status">
        {state.status === "loading" ? (
          <p className={styles.hint} data-testid="directions-loading">
            {state.request === "route"
              ? t("tools.directions.findingRoute", {})
              : t("tools.directions.findingArea", {})}
          </p>
        ) : null}
        {state.status === "error" ? (
          <div className={styles.group} data-testid="directions-error">
            <p className={styles.statusLine}>
              <Icon icon={Warning} className={styles.errorIcon} />
              <span>
                {format(routingErrorMessage(state.kind, state.request))}
              </span>
            </p>
            {state.kind === "network" || state.kind === "rate-limited" ? (
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  data-testid="directions-retry"
                  onClick={directions.retry}
                >
                  {t("tools.tryAgain", {})}
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
            icon={Trash}
            data-testid="directions-clear"
            onClick={directions.clear}
          >
            {t("tools.directions.clear", {})}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
