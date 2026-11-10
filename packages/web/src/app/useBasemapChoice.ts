import type { BasemapDefinition, MapEngineError } from "@karta/core";
import { useBasemaps, useSettings } from "@karta/map";
import { useCallback, useState } from "react";

/** A basemap swap that could not load. */
export interface BasemapFailure {
  /** The name of the basemap that could not load. */
  readonly name: string;
  /** The basemap the map kept drawing. */
  readonly kept: BasemapDefinition;
  /**
   * True when the basemap failed while the map was starting, so there was no
   * earlier basemap and `kept` is the default. Going back then saves it.
   */
  readonly atMount?: boolean;
}

/** What {@link useBasemapChoice} returns. */
export interface BasemapChoice {
  /** The basemap id the picker shows as chosen. */
  readonly choice: string;
  /**
   * The choice that is saved, or named by a shared link: the last one known
   * to load. The link is written from this, so a reload never starts from a
   * basemap that failed.
   */
  readonly savedChoice: string;
  /** The basemap to draw. */
  readonly basemap: BasemapDefinition;
  /**
   * Every basemap whose pixels are, or are about to be, on screen: `basemap`
   * (which is the one asked for, still loading, during a swap) and the one
   * the map still draws until the swap has loaded. A basemap's terms (its
   * permanent credit, its ban on saved images) hold while it is in this list,
   * so they never lapse early or late.
   */
  readonly inUse: readonly BasemapDefinition[];
  /** The swap that could not load, until the person goes back. */
  readonly failure: BasemapFailure | null;
  /**
   * Asks for a basemap. It is saved, replacing a basemap named by a link,
   * once it has loaded (see `applied`), or at once if the map already shows it.
   */
  readonly choose: (id: string) => void;
  /** Pass to `MapView`'s `onBasemapApplied`. */
  readonly applied: (basemap: BasemapDefinition) => void;
  /** Pass to `MapView`'s `onBasemapError`. */
  readonly failed: (
    error: unknown,
    failed: BasemapDefinition,
    kept: BasemapDefinition,
  ) => void;
  /**
   * Pass to `MapView`'s `onEngineError`. A map that could not start on a
   * basemap other than the default (a saved or linked one whose provider is
   * down, say) falls back to the default, with the same failure as a swap
   * that could not load. Any other engine error is not about the basemap.
   */
  readonly mountFailed: (
    error: MapEngineError,
    failed: BasemapDefinition,
  ) => void;
  /**
   * Drops the choice that failed, so the picker shows the saved one again.
   * After a failed start there is no earlier basemap to show, so the default
   * the map fell back to is saved instead, and the picker follows it.
   */
  readonly goBack: () => void;
}

/**
 * The basemap choice: a basemap named by a shared link wins once, at load,
 * without overwriting the saved choice; after that the saved setting decides.
 * A saved or linked id that names no basemap the host offers (one that has
 * been removed, such as "dark", or the "auto" choice of earlier versions,
 * which followed the theme) counts as the host's default basemap, so the
 * picker always has a checked option that matches the map. Nothing is saved
 * until the person picks a basemap. The basemap never depends on the interface
 * theme.
 *
 * @remarks A new choice is held as pending and saved only when the map
 *   reports that it loaded, so a basemap that fails is never saved or written
 *   to the link, and a reload cannot loop on it. While a failure is shown the
 *   map is told to draw the basemap it kept, and the picker still shows the
 *   failed choice until the person goes back or dismisses the message.
 */
export function useBasemapChoice(
  linkedBasemapId: string | undefined,
): BasemapChoice {
  const catalogue = useBasemaps();
  const { settings, update } = useSettings();
  const [linked, setLinked] = useState(linkedBasemapId);
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<BasemapFailure | null>(null);

  const requested = linked ?? settings.basemapId;
  const savedChoice = catalogue.resolve(requested).id;
  const choice = pending ?? savedChoice;
  const basemap = failure ? failure.kept : catalogue.resolve(choice);
  // The map starts on the saved or linked basemap, so that is what it draws
  // until a swap loads (`applied`) or fails and keeps the old one (`failed`).
  const [drawn, setDrawn] = useState(() => catalogue.resolve(requested));
  const inUse = drawn.id === basemap.id ? [basemap] : [basemap, drawn];

  const save = useCallback(
    (id: string) => {
      setLinked(undefined);
      setPending(undefined);
      update({ basemapId: id });
    },
    [update],
  );

  const choose = useCallback(
    (id: string) => {
      setFailure(null);
      // Saved at once only when nothing is loading: while a swap is in
      // flight, `basemap` is the one asked for, not yet the one drawn.
      if (pending === undefined && catalogue.resolve(id).id === basemap.id) {
        save(id);
      } else {
        setPending(id);
      }
    },
    [catalogue, basemap.id, pending, save],
  );

  const applied = useCallback(
    (loaded: BasemapDefinition) => {
      // The map reports only the swap it is still waiting for, so whatever
      // loaded is what it draws now: a choice made here, or a saved one that
      // changed elsewhere (another tab) and was drawn without a local choice.
      setDrawn(loaded);
      if (
        pending !== undefined &&
        catalogue.resolve(pending).id === loaded.id
      ) {
        save(pending);
      }
    },
    [catalogue, pending, save],
  );

  const failed = useCallback(
    (_error: unknown, which: BasemapDefinition, kept: BasemapDefinition) => {
      setDrawn(kept);
      setFailure({ name: which.name, kept });
    },
    [],
  );

  const mountFailed = useCallback(
    (error: MapEngineError, which: BasemapDefinition) => {
      const fallback = catalogue.resolve(catalogue.defaultId);
      if (error.reason !== "load-failed" || which.id === fallback.id) {
        return;
      }
      setDrawn(fallback);
      setFailure({ name: which.name, kept: fallback, atMount: true });
    },
    [catalogue],
  );

  const goBack = useCallback(() => {
    setPending(undefined);
    setFailure(null);
    if (failure?.atMount) {
      save(failure.kept.id);
    }
  }, [failure, save]);

  return {
    choice,
    savedChoice,
    basemap,
    inUse,
    failure,
    choose,
    applied,
    failed,
    mountFailed,
    goBack,
  };
}
