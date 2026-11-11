import {
  announceBasemap,
  type BasemapDefinition,
  usesMoreData,
} from "@mapcairn/core";
import { Check } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import {
  useBasemapAvailability,
  useBasemaps,
  useSaveData,
} from "../../services";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { useAnnounce } from "../../ui/LiveRegion";
import { visuallyHidden } from "../../ui/VisuallyHidden/VisuallyHidden.css";
import {
  badge,
  badgeIcon,
  dataNote,
  grid,
  image,
  name,
  retry,
  swatch,
  swatchColourVar,
  thumb,
  tile,
} from "./BasemapPicker.css";

/** Intrinsic size of a basemap preview, in CSS pixels. Reserves the space before load. */
const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 120;

/** Props for {@link BasemapPicker}. */
export interface BasemapPickerProps {
  /**
   * The chosen basemap id. An id that names no basemap on offer is shown as
   * the default basemap.
   */
  readonly value: string;
  /** Called with the id of the tile the user chose. */
  readonly onChange: (id: string) => void;
}

/**
 * Chooses the basemap: a three-across grid of previews as a radio group, one
 * tile for each basemap the host offers (`useBasemaps`).
 *
 * Each tile is a native radio input, visually hidden and drawn through its
 * label. Native radios give one tab stop for the group, arrow keys that move
 * and select in one step (wrapping at the ends and following the writing
 * direction) and the radio role in every screen reader, with no script. The
 * selected tile has an accent outline and a check badge, so selection never
 * relies on colour. A preview that fails to load gives way to the basemap's
 * swatch, as a basemap with no preview does, with the name still visible. The basemap does not follow the
 * interface theme: A host's dark basemap is an ordinary choice, as the others are.
 *
 * @remarks In Save data mode (`useSaveData`), and for a basemap that has no
 *   preview image, no preview is requested: the tile shows the same frame
 *   with a plain colour swatch, the basemap's own `swatch` colour or else the
 *   map background. A basemap whose tiles are images (`usesMoreData`: a
 *   raster map, or imagery under labels) carries the note "Uses more data". Names,
 *   the radios and the selection badge are unchanged, and every basemap can
 *   still be chosen.
 *
 *   A basemap marked unavailable (`useBasemapAvailability`, which the host
 *   sets when every tile of it failed) has the words "Not available right
 *   now" inside its label, so they are part of the radio's name, and its
 *   radio is natively disabled, so the arrow keys skip it, unless it is the
 *   chosen one. While any basemap is marked, a "Try again" button under the
 *   group clears every mark, so the map judges a basemap again when it is
 *   chosen, and moves focus to the chosen radio, because the button goes.
 */
export function BasemapPicker({ value, onChange }: BasemapPickerProps) {
  const groupName = useId();
  const announce = useAnnounce();
  const catalogue = useBasemaps();
  const shownId = catalogue.resolve(value).id;
  const saveData = useSaveData();
  const { unavailable, clear } = useBasemapAvailability();
  const group = useRef<HTMLDivElement>(null);

  // Clearing the marks removes this button, so focus moves to the chosen
  // radio instead of being lost with it.
  const tryAgain = () => {
    clear();
    group.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
  };

  const choose = (basemap: BasemapDefinition) => {
    announce(announceBasemap(basemap.name));
    onChange(basemap.id);
  };

  return (
    <>
      <div
        ref={group}
        role="radiogroup"
        aria-label="Basemap"
        className={grid}
        data-testid="basemap-picker"
      >
        {catalogue.basemaps.map((basemap) => (
          <BasemapTile
            key={basemap.id}
            basemap={basemap}
            groupName={groupName}
            selected={basemap.id === shownId}
            saveData={saveData}
            unavailable={unavailable.has(basemap.id)}
            onChoose={() => choose(basemap)}
          />
        ))}
      </div>
      {unavailable.size > 0 ? (
        <div className={retry}>
          <Button
            variant="quiet"
            onClick={tryAgain}
            data-testid="basemap-try-again"
          >
            Try again
          </Button>
        </div>
      ) : null}
    </>
  );
}

interface BasemapTileProps {
  readonly basemap: BasemapDefinition;
  readonly groupName: string;
  readonly selected: boolean;
  /** Save data mode: a swatch instead of the preview, and a note on raster basemaps. */
  readonly saveData: boolean;
  /**
   * The basemap's provider is not working right now. The tile says so, and is
   * disabled unless it is the chosen one, which stays enabled so the group is
   * never left with a checked radio the keyboard cannot reach.
   */
  readonly unavailable: boolean;
  /** Called when this tile is chosen. */
  readonly onChoose: () => void;
}

function BasemapTile({
  basemap,
  groupName,
  selected,
  saveData,
  unavailable,
  onChoose,
}: BasemapTileProps) {
  const [failed, setFailed] = useState(false);
  const preview = saveData ? undefined : basemap.thumbnail;
  const showSwatch = preview === undefined || failed;
  // A ref callback with a listener, not an onError prop, which the a11y lint
  // rejects on a non-interactive element.
  const watchImage = useCallback((image: HTMLImageElement | null) => {
    if (!image) {
      return;
    }
    const fail = () => setFailed(true);
    image.addEventListener("error", fail);
    return () => image.removeEventListener("error", fail);
  }, []);
  // The basemap's own swatch colour, through a custom property.
  const swatchColour = basemap.swatch;
  const paintSwatch = useCallback(
    (element: HTMLElement | null) => {
      if (!element) {
        return;
      }
      if (swatchColour === undefined) {
        element.style.removeProperty(swatchColourVar);
      } else {
        element.style.setProperty(swatchColourVar, swatchColour);
      }
    },
    [swatchColour],
  );
  return (
    <label className={tile} data-testid={`basemap-option-${basemap.id}`}>
      <input
        type="radio"
        className={visuallyHidden}
        name={groupName}
        value={basemap.id}
        checked={selected}
        disabled={unavailable && !selected}
        onChange={onChoose}
      />
      <span className={thumb({ selected, unavailable })}>
        {showSwatch ? (
          <span
            className={swatch}
            ref={paintSwatch}
            data-testid={`basemap-swatch-${basemap.id}`}
          />
        ) : null}
        {showSwatch ? null : (
          <img
            className={image}
            src={preview}
            alt=""
            width={THUMB_WIDTH}
            height={THUMB_HEIGHT}
            loading="lazy"
            decoding="async"
            ref={watchImage}
          />
        )}
        {selected ? (
          <span
            className={badge}
            data-testid={`basemap-selected-${basemap.id}`}
          >
            <Icon icon={Check} className={badgeIcon} />
          </span>
        ) : null}
      </span>
      <span className={name({ selected })}>{basemap.name}</span>
      {unavailable ? (
        <span
          className={dataNote}
          data-testid={`basemap-unavailable-note-${basemap.id}`}
        >
          Not available right now
        </span>
      ) : null}
      {saveData && usesMoreData(basemap) ? (
        <span
          className={dataNote}
          data-testid={`basemap-data-note-${basemap.id}`}
        >
          Uses more data
        </span>
      ) : null}
    </label>
  );
}
