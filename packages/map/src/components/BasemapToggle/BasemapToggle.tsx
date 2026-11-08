import {
  type Basemap,
  getBasemapDefinition,
  getRegisteredBasemapIds,
} from "../../constants/basemaps";
import * as styles from "./BasemapToggle.css";

interface BasemapToggleProps {
  basemap: Basemap;
  onChange: (basemap: Basemap) => void;
  label?: string;
  optionAriaLabel?: (label: string) => string;
}

/** A `SegmentedControl` for choosing the active map basemap. */
export function BasemapToggle({
  basemap,
  onChange,
  label = "Basemap",
  optionAriaLabel = (label) => `${label} basemap`,
}: BasemapToggleProps) {
  return (
    <fieldset className={styles.root}>
      <legend>{label}</legend>
      <div className={styles.options}>
        {getRegisteredBasemapIds().map((id) => {
          const definition = getBasemapDefinition(id);
          return (
            <button
              key={id}
              type="button"
              className={styles.option}
              data-basemap={id}
              data-testid={`basemap-option-${id}`}
              data-e2e={`basemap-option-${id}`}
              aria-label={optionAriaLabel(definition.label)}
              aria-pressed={basemap === id}
              onClick={() => onChange(id)}
            >
              <span className={styles.swatch} aria-hidden="true" />
              <span className={styles.optionLabel}>{definition.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
