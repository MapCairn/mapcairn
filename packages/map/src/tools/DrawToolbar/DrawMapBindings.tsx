import { useEffect } from "react";
import { useMap } from "../../host/MapContext";
import type { UseDraw } from "./useDraw";

/** Props for {@link DrawMapBindings}. */
export interface DrawMapBindingsProps {
  /** The drawing state from `useDraw`. */
  readonly draw: UseDraw;
}

/**
 * Connects the draw tool to the live map without drawing anything: it gives
 * the adapter the handles of the selected shape, and passes the adapter's
 * handle presses and hovers to the tool. Render it inside `MapView`.
 *
 * @remarks The handles are cleared when the tool closes or the map goes, so a
 *   press on the bare map never starts a drag that nothing draws.
 */
export function DrawMapBindings({ draw }: DrawMapBindingsProps) {
  const { adapter } = useMap();
  const { handles, onHandleDrag, onHandleHover } = draw;

  useEffect(() => {
    adapter?.setEditHandles(handles);
  }, [adapter, handles]);

  useEffect(() => {
    if (!adapter) {
      return;
    }
    const stops = [
      adapter.on("handleDrag", onHandleDrag),
      adapter.on("handleHover", onHandleHover),
    ];
    return () => {
      for (const stop of stops) {
        stop();
      }
      adapter.setEditHandles([]);
    };
  }, [adapter, onHandleDrag, onHandleHover]);

  return null;
}
