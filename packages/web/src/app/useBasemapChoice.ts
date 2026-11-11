import type { BasemapDefinition, MapEngineError } from "@mapcairn/core";
import {
  useBasemapAvailability,
  useBasemaps,
  useServices,
  useSettings,
} from "@mapcairn/map";
import { useCallback, useRef, useState } from "react";

/** A basemap swap that could not load. */
export interface BasemapFailure {
  /** The id of the basemap that could not load. */
  readonly id: string;
  /** The name of the basemap that could not load. */
  readonly name: string;
  /** The basemap the map kept drawing. */
  readonly kept: BasemapDefinition;
  /**
   * True when the basemap failed while the map was starting, so there was no
   * earlier basemap and `kept` is the default. Going back then saves it.
   */
  readonly atMount?: boolean;
  /**
   * True when every tile of `name` failed because its provider is down. The
   * map went back to `kept` if there was another basemap to draw, and stays
   * on `name` (then `kept` is that basemap) when there was none.
   */
  readonly unavailable?: boolean;
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
   * Pass to `MapView`'s `onBasemapUnavailable`. Marks the basemap
   * unavailable (see `useBasemapAvailability`) and draws the one before it
   * instead, or the default, never one that is itself marked. With nothing
   * left it stays and only says so. A basemap the person chose in this
   * session, and that was saved when its style loaded, is not kept: the
   * choice saved before it comes back. A saved or linked basemap the person
   * did not just choose is left as it is.
   */
  readonly unavailableNow: (which: BasemapDefinition) => void;
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
 * been removed, such as "maptoolkit-dark", or the "auto" choice of earlier versions,
 * which followed the theme) counts as the host's default basemap, so the
 * picker always has a checked option that matches the map. Nothing is saved
 * until the person picks a basemap. The basemap never depends on the interface
 * theme.
 *
 * @remarks A new choice is held as pending and saved only when the map
 *   reports that it loaded, so a basemap that fails is never saved or written
 *   to the link, and a reload cannot loop on it. A choice that loads but
 *   whose tiles then all fail (`unavailableNow`) was saved when its style
 *   loaded, so the choice saved before it is put back; a saved or linked
 *   basemap the person did not choose in this session is not rewritten by
 *   an outage, only by going back or dismissing the message. While a
 *   failure is shown the map is told to draw the basemap it kept, and after
 *   a failed swap the picker still shows the failed choice until the person
 *   goes back or dismisses the message.
 */
export function useBasemapChoice(
  linkedBasemapId: string | undefined,
): BasemapChoice {
  const catalogue = useBasemaps();
  const { settings, update } = useSettings();
  // Read when a report arrives, which can be before the render that follows
  // a save, so the stored value is read from the store, not from this render.
  const { settings: store } = useServices();
  const [linked, setLinked] = useState(linkedBasemapId);
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<BasemapFailure | null>(null);
  const { unavailable, markUnavailable, clear } = useBasemapAvailability();
  // The basemap drawn before the current one, to go back to.
  const previous = useRef<BasemapDefinition | undefined>(undefined);
  // The last choice the person made and saved here, with the stored id it
  // replaced, so a choice whose provider turns out to be down is undone.
  const chosen = useRef<{ id: string; before: string } | undefined>(undefined);

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

  const saveChoice = useCallback(
    (id: string) => {
      chosen.current = {
        id: catalogue.resolve(id).id,
        before: store.get().basemapId,
      };
      save(id);
    },
    [catalogue, store, save],
  );

  const choose = useCallback(
    (id: string) => {
      setFailure(null);
      // Saved at once only when nothing is loading: while a swap is in
      // flight, `basemap` is the one asked for, not yet the one drawn.
      if (pending === undefined && catalogue.resolve(id).id === basemap.id) {
        saveChoice(id);
      } else {
        setPending(id);
      }
    },
    [catalogue, basemap.id, pending, saveChoice],
  );

  const applied = useCallback(
    (loaded: BasemapDefinition) => {
      // The map reports only the swap it is still waiting for, so whatever
      // loaded is what it draws now: a choice made here, or a saved one that
      // changed elsewhere (another tab) and was drawn without a local choice.
      if (loaded.id !== drawn.id) {
        previous.current = drawn;
      }
      setDrawn(loaded);
      clear(loaded.id);
      if (
        pending !== undefined &&
        catalogue.resolve(pending).id === loaded.id
      ) {
        saveChoice(pending);
      }
    },
    [catalogue, pending, saveChoice, drawn, clear],
  );

  const failed = useCallback(
    (_error: unknown, which: BasemapDefinition, kept: BasemapDefinition) => {
      setDrawn(kept);
      setFailure({ id: which.id, name: which.name, kept });
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
      setFailure({
        id: which.id,
        name: which.name,
        kept: fallback,
        atMount: true,
      });
    },
    [catalogue],
  );

  const unavailableNow = useCallback(
    (which: BasemapDefinition) => {
      markUnavailable(which.id);
      if (chosen.current?.id === which.id) {
        if (catalogue.resolve(store.get().basemapId).id === which.id) {
          update({ basemapId: chosen.current.before });
        }
        chosen.current = undefined;
      }
      // A report about a basemap that is no longer the one asked for is late.
      if (which.id !== basemap.id) {
        return;
      }
      const fallback = [
        previous.current,
        catalogue.resolve(catalogue.defaultId),
      ]
        .filter((candidate): candidate is BasemapDefinition => !!candidate)
        .find(
          (candidate) =>
            candidate.id !== which.id && !unavailable.has(candidate.id),
        );
      const kept = fallback ?? which;
      setDrawn(kept);
      setFailure({ id: which.id, name: which.name, kept, unavailable: true });
    },
    [catalogue, markUnavailable, unavailable, basemap.id, store, update],
  );

  const goBack = useCallback(() => {
    setPending(undefined);
    setFailure(null);
    if (failure?.atMount || failure?.unavailable) {
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
    unavailableNow,
    goBack,
  };
}
