import {
  announceBasemap,
  BASEMAPS,
  type BasemapDefinition,
  DEFAULT_BASEMAP_ID,
  getBasemap,
} from "@karta/core";
import { Check } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { Icon } from "../../ui/Icon";
import { useAnnounce } from "../../ui/LiveRegion";
import { Switch } from "../../ui/Switch";
import { visuallyHidden } from "../../ui/VisuallyHidden/VisuallyHidden.css";
import {
  badge,
  badgeIcon,
  grid,
  image,
  name,
  picker,
  thumb,
  tile,
} from "./BasemapPicker.css";

/** Intrinsic size of a basemap preview, in CSS pixels. Reserves the space before load. */
const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 120;

/** Props for {@link BasemapPicker}. */
export interface BasemapPickerProps {
  /**
   * The stored choice: a basemap id, or `AUTO_BASEMAP_ID` while the map
   * follows the theme. An unknown id is shown as the default basemap.
   */
  readonly value: string;
  /**
   * Called with the id of the tile the user chose. It is also called when the
   * user clicks the tile that is already shown while the map follows the
   * theme, because that is how they pin the map to that basemap.
   */
  readonly onChange: (id: string) => void;
  /** Whether the map follows the theme. */
  readonly themeMatch: boolean;
  /** Called with the next state of the "Match the map to the theme" switch. */
  readonly onThemeMatchChange: (themeMatch: boolean) => void;
  /**
   * The basemap currently on screen. While `themeMatch` is on this is the
   * tile that is marked, because the stored choice is only "auto".
   */
  readonly activeBasemapId?: string;
}

/**
 * Chooses the basemap: a three-across grid of previews as a radio group,
 * then a switch to follow the interface theme.
 *
 * Each tile is a native radio input, visually hidden and drawn through its
 * label. Native radios give one tab stop for the group, arrow keys that move
 * and select in one step (wrapping at the ends and following the writing
 * direction) and the radio role in every screen reader, with no script. The
 * selected tile has an accent outline and a check badge, so selection never
 * relies on colour. A preview that fails to load disappears and leaves a
 * neutral tile, with the name still visible.
 * @remarks The stored id is `AUTO_BASEMAP_ID` while `themeMatch` is on, so the
 *   caller passes `activeBasemapId` to say which tile that resolves to.
 */
export function BasemapPicker({
  value,
  onChange,
  themeMatch,
  onThemeMatchChange,
  activeBasemapId,
}: BasemapPickerProps) {
  const groupName = useId();
  const announce = useAnnounce();
  const candidate = themeMatch ? (activeBasemapId ?? value) : value;
  const shownId = getBasemap(candidate) ? candidate : DEFAULT_BASEMAP_ID;

  const choose = (basemap: BasemapDefinition) => {
    announce(announceBasemap(basemap.name));
    onChange(basemap.id);
  };

  return (
    <div className={picker}>
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
            onChoose={() => choose(basemap)}
            pinOnClick={themeMatch}
          />
        ))}
      </div>
      <Switch
        label="Match the map to the theme"
        checked={themeMatch}
        onCheckedChange={onThemeMatchChange}
        data-testid="basemap-theme-match"
      />
    </div>
  );
}

interface BasemapTileProps {
  readonly basemap: BasemapDefinition;
  readonly groupName: string;
  readonly selected: boolean;
  /** Called when this tile is chosen. */
  readonly onChoose: () => void;
  /** Whether clicking the tile that is already selected also counts as a choice. */
  readonly pinOnClick: boolean;
}

function BasemapTile({
  basemap,
  groupName,
  selected,
  onChoose,
  pinOnClick,
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
        onClick={selected && pinOnClick ? onChoose : undefined}
      />
      <span className={thumb({ selected })}>
        {failed ? null : (
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
    </label>
  );
}
