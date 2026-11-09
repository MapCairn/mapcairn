import {
  AUTO_BASEMAP_ID,
  type BasemapDefinition,
  isKnownBasemapChoice,
  type ResolvedTheme,
  resolveBasemap,
} from "@karta/core";
import { useSettings } from "@karta/map";
import { useCallback, useState } from "react";

/** What {@link useBasemapChoice} returns. */
export interface BasemapChoice {
  /** The choice the picker shows: a basemap id or `AUTO_BASEMAP_ID`. */
  readonly choice: string;
  /** The basemap to draw, after "Auto" is applied. */
  readonly basemap: BasemapDefinition;
  /** Stores the person's choice. It replaces a basemap named by a link. */
  readonly choose: (id: string) => void;
}

/**
 * The basemap choice: a basemap named by a shared link wins once, at load,
 * without overwriting the saved choice; after that the saved setting decides.
 * A saved or linked id that names no built-in basemap (for example one that
 * has been removed) counts as "Auto", so the picker always has a checked
 * option that matches the map.
 */
export function useBasemapChoice(
  linkedBasemapId: string | undefined,
  theme: ResolvedTheme,
): BasemapChoice {
  const { settings, update } = useSettings();
  const [linked, setLinked] = useState(linkedBasemapId);
  const requested = linked ?? settings.basemapId;
  const choice = isKnownBasemapChoice(requested) ? requested : AUTO_BASEMAP_ID;
  const basemap = resolveBasemap(choice, theme);

  const choose = useCallback(
    (id: string) => {
      setLinked(undefined);
      update({ basemapId: id });
    },
    [update],
  );

  return { choice, basemap, choose };
}
