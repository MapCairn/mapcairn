import { memo, useState } from "react";
import { getLayer, getLayerGroups } from "../../layers/registry";
import { m } from "../../paraglide/messages.js";
import * as styles from "./LayerToggles.css";

interface LayerTogglesProps {
  visibleLayerIds: string[];
  onToggle: (id: string) => void;
  opacityByLayer?: Record<string, number>;
  onOpacityChange?: (id: string, opacity: number) => void;
  failedLayerIds?: string[];
}

function LayerOpacity({
  id,
  label,
  value = 1,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (id: string, value: number) => void;
}) {
  return (
    <label>
      {m.layer_opacity_label({ label })}
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(event) => onChange(id, Number(event.target.value))}
      />
    </label>
  );
}

/** Renders configured groups only. Dataset loading stays in the generic map renderer. */
export const LayerToggles = memo(function LayerToggles({
  visibleLayerIds,
  onToggle,
  opacityByLayer = {},
  onOpacityChange,
  failedLayerIds = [],
}: LayerTogglesProps) {
  const [query, setQuery] = useState("");
  const groups = getLayerGroups();
  return (
    <div>
      <label className={styles.searchLabel}>
        {m.layer_search_label()}
        <input
          type="search"
          value={query}
          placeholder={m.layer_search_placeholder()}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {groups.map((group) => {
        const layers = group.layerIds
          .map(getLayer)
          .filter((layer) => layer !== undefined)
          .filter((layer) =>
            `${layer.label} ${layer.description ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          );
        if (layers.length === 0) {
          return null;
        }
        return (
          <fieldset key={group.id} className={styles.group}>
            <legend>{group.title}</legend>
            {group.description ? <p>{group.description}</p> : null}
            <ul className={styles.list}>
              {layers.map((layer) => {
                const id = `layer-toggle-${layer.id}`;
                const visible = visibleLayerIds.includes(layer.id);
                return (
                  <li key={layer.id} className={styles.row}>
                    <label className={styles.rowLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={visible}
                        disabled={!layer.available}
                        onChange={() => onToggle(layer.id)}
                        aria-labelledby={`${id}-label`}
                        aria-describedby={
                          layer.description ? `${id}-description` : undefined
                        }
                        data-testid={id}
                        data-e2e={id}
                      />
                      <span id={`${id}-label`} className={styles.label}>
                        {layer.label}
                      </span>
                      {!layer.available ? (
                        <span className={styles.badge}>
                          {m.layer_unavailable_badge()}
                        </span>
                      ) : null}
                    </label>
                    {layer.description ? (
                      <p
                        id={`${id}-description`}
                        className={styles.description}
                      >
                        {layer.description}
                      </p>
                    ) : null}
                    {failedLayerIds.includes(layer.id) ? (
                      <span role="status" className={styles.badgeError}>
                        {m.layer_failed_badge()}
                      </span>
                    ) : null}
                    {visible && onOpacityChange ? (
                      <LayerOpacity
                        id={layer.id}
                        label={layer.label}
                        value={opacityByLayer[layer.id]}
                        onChange={onOpacityChange}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
});
