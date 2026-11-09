import {
  AUTO_BASEMAP_ID,
  type BasemapDefinition,
  isKnownBasemapChoice,
  type ResolvedTheme,
  resolveBasemap,
} from "@karta/core";
import { useSettings } from "@karta/map";
import { useCallback, useState } from "react";

/** A basemap swap that could not load. */
export interface BasemapFailure {
  /** The name of the basemap that could not load. */
  readonly name: string;
  /** The basemap the map kept drawing. */
  readonly kept: BasemapDefinition;
}

/** What {@link useBasemapChoice} returns. */
export interface BasemapChoice {
  /** The choice the picker shows: a basemap id or `AUTO_BASEMAP_ID`. */
  readonly choice: string;
  /**
   * The choice that is saved, or named by a shared link: the last one known
   * to load. The link is written from this, so a reload never starts from a
   * basemap that failed.
   */
  readonly savedChoice: string;
  /** The basemap to draw, after "Auto" is applied. */
  readonly basemap: BasemapDefinition;
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
  /** Drops the choice that failed, so the picker shows the saved one again. */
  readonly goBack: () => void;
}

/**
 * The basemap choice: a basemap named by a shared link wins once, at load,
 * without overwriting the saved choice; after that the saved setting decides.
 * A saved or linked id that names no built-in basemap (for example one that
 * has been removed) counts as "Auto", so the picker always has a checked
 * option that matches the map.
 *
 * @remarks A new choice is held as pending and saved only when the map
 *   reports that it loaded, so a basemap that fails is never saved or written
 *   to the link, and a reload cannot loop on it. While a failure is shown the
 *   map is told to draw the basemap it kept, and the picker still shows the
 *   failed choice until the person goes back or dismisses the message.
 */
export function useBasemapChoice(
  linkedBasemapId: string | undefined,
  theme: ResolvedTheme,
): BasemapChoice {
  const { settings, update } = useSettings();
  const [linked, setLinked] = useState(linkedBasemapId);
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<BasemapFailure | null>(null);

  const requested = linked ?? settings.basemapId;
  const savedChoice = isKnownBasemapChoice(requested)
    ? requested
    : AUTO_BASEMAP_ID;
  const choice = pending ?? savedChoice;
  const basemap = failure ? failure.kept : resolveBasemap(choice, theme);

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
      if (
        pending === undefined &&
        resolveBasemap(id, theme).id === basemap.id
      ) {
        save(id);
      } else {
        setPending(id);
      }
    },
    [basemap.id, pending, save, theme],
  );

  const applied = useCallback(
    (loaded: BasemapDefinition) => {
      if (
        pending !== undefined &&
        resolveBasemap(pending, theme).id === loaded.id
      ) {
        save(pending);
      }
    },
    [pending, save, theme],
  );

  const failed = useCallback(
    (_error: unknown, which: BasemapDefinition, kept: BasemapDefinition) => {
      setFailure({ name: which.name, kept });
    },
    [],
  );

  const goBack = useCallback(() => {
    setPending(undefined);
    setFailure(null);
  }, []);

  return {
    choice,
    savedChoice,
    basemap,
    failure,
    choose,
    applied,
    failed,
    goBack,
  };
}
