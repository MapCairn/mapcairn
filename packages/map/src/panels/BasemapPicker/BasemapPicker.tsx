import {
  announceBasemap,
  BASEMAPS,
  type BasemapDefinition,
  DEFAULT_BASEMAP_ID,
  getBasemap,
} from "@karta/core";
import { Check } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { useSaveData } from "../../services";
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
  swatch,
  thumb,
  tile,
} from "./BasemapPicker.css";

/** Intrinsic size of a basemap preview, in CSS pixels. Reserves the space before load. */
const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 120;

/** Props for {@link BasemapPicker}. */
export interface BasemapPickerProps {
  /**
   * The chosen basemap id. An id that names no built-in basemap is shown as
   * the default basemap.
   */
  readonly value: string;
  /** Called with the id of the tile the user chose. */
  readonly onChange: (id: string) => void;
}

/**
 * Chooses the basemap: a three-across grid of previews as a radio group.
 *
 * Each tile is a native radio input, visually hidden and drawn through its
 * label. Native radios give one tab stop for the group, arrow keys that move
 * and select in one step (wrapping at the ends and following the writing
 * direction) and the radio role in every screen reader, with no script. The
 * selected tile has an accent outline and a check badge, so selection never
 * relies on colour. A preview that fails to load disappears and leaves a
 * neutral tile, with the name still visible. The basemap does not follow the
 * interface theme: Dark is an ordinary choice.
 *
 * @remarks In Save data mode (`useSaveData`) no preview image is requested:
 *   each tile shows the same frame with a plain colour swatch, and a raster
 *   basemap, whose tiles are images, carries the note "Uses more data". Names,
 *   the radios and the selection badge are unchanged, and every basemap can
 *   still be chosen.
 */
export function BasemapPicker({ value, onChange }: BasemapPickerProps) {
  const groupName = useId();
  const announce = useAnnounce();
  const shownId = getBasemap(value) ? value : DEFAULT_BASEMAP_ID;
  const saveData = useSaveData();

  const choose = (basemap: BasemapDefinition) => {
    announce(announceBasemap(basemap.name));
    onChange(basemap.id);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Basemap"
      className={grid}
      data-testid="basemap-picker"
    >
      {BASEMAPS.map((basemap) => (
        <BasemapTile
          key={basemap.id}
          basemap={basemap}
          groupName={groupName}
          selected={basemap.id === shownId}
          saveData={saveData}
          onChoose={() => choose(basemap)}
        />
      ))}
    </div>
  );
}

interface BasemapTileProps {
  readonly basemap: BasemapDefinition;
  readonly groupName: string;
  readonly selected: boolean;
  /** Save data mode: a swatch instead of the preview, and a note on raster basemaps. */
  readonly saveData: boolean;
  /** Called when this tile is chosen. */
  readonly onChoose: () => void;
}

function BasemapTile({
  basemap,
  groupName,
  selected,
  saveData,
  onChoose,
}: BasemapTileProps) {
  const [failed, setFailed] = useState(false);
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
  return (
    <label className={tile} data-testid={`basemap-option-${basemap.id}`}>
      <input
        type="radio"
        className={visuallyHidden}
        name={groupName}
        value={basemap.id}
        checked={selected}
        onChange={onChoose}
      />
      <span className={thumb({ selected })}>
        {saveData ? (
          <span
            className={swatch}
            data-testid={`basemap-swatch-${basemap.id}`}
          />
        ) : null}
        {saveData || failed ? null : (
          <img
            className={image}
            src={basemap.thumbnail}
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
      {saveData && basemap.source.kind === "raster" ? (
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
