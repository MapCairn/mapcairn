import { type BasemapDefinition, buildAttribution } from "@karta/core";
import { Info } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useMap } from "../../host";
import { IconButton } from "../../ui";
import * as styles from "./Attribution.css";

/**
 * Where the credits popover sits: straight above the button, or, when the
 * list would have to scroll there, beside the end stack where there is more
 * height (a short landscape phone).
 */
type Placement = "above" | "beside";

/** Props for {@link Attribution}. */
export interface AttributionProps {
  /** The active basemap. Its credits, plus the engine's, are listed. */
  readonly basemap: BasemapDefinition;
}

/**
 * The map credits for the bottom-end slot: a compact "Map credits" button
 * (a 44 px target around a small info glyph) that expands into a labelled
 * region of credit links built with `buildAttribution`.
 *
 * @remarks The popover opens above the button. If the credits would scroll
 *   there, it moves beside the end stack before it is painted, where
 *   `MapChrome` measures more room; it scrolls only if that is not enough
 *   either. Opening moves focus to the first link. The popover closes on
 *   Escape, on a second press of the button, on a pointer down outside it,
 *   and when the map moves; if focus was inside it, focus goes back to the
 *   button with an explicit `focus()` (Safari does not focus buttons on
 *   click). The credits are always reachable through the button; nothing
 *   here hides or removes them. Reads the view with `useMap()`, so it must
 *   sit inside the map context.
 */
export function Attribution({ basemap }: AttributionProps) {
  const { view } = useMap();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>("above");
  const regionId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLElement>(null);
  const openedOnView = useRef(view);
  const entries = buildAttribution(basemap);

  const close = useCallback(() => {
    const root = rootRef.current;
    const active = root?.ownerDocument.activeElement ?? null;
    const focusWasInside = active !== null && root?.contains(active) === true;
    setOpen(false);
    if (focusWasInside) {
      root?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, []);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    openedOnView.current = view;
    setPlacement("above");
    setOpen(true);
  };

  // Before the first paint of an open popover: if the credits overflow the
  // room above the button, use the room beside the end stack instead.
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (
      open &&
      placement === "above" &&
      region !== null &&
      region.scrollHeight > region.clientHeight
    ) {
      setPlacement("beside");
    }
  }, [open, placement]);

  // Focus moves into the popover once it is shown.
  useEffect(() => {
    if (!open) {
      return;
    }
    const region = regionRef.current;
    const first = region?.querySelector<HTMLElement>("a[href]");
    (first ?? region)?.focus();
  }, [open]);

  // A pointer down anywhere outside closes it.
  useEffect(() => {
    const root = rootRef.current;
    if (!open || !root) {
      return;
    }
    const doc = root.ownerDocument;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node && root.contains(event.target))) {
        close();
      }
    };
    doc.addEventListener("pointerdown", onPointerDown);
    return () => {
      doc.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  // Moving the map closes it, so it never hides what the user is looking at.
  useEffect(() => {
    if (open && view !== openedOnView.current) {
      close();
    }
  }, [open, view, close]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape is handled for the button and the popover together.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Escape is handled for the button and the popover together.
    <div
      ref={rootRef}
      data-chrome="attribution"
      className={styles.root}
      onKeyDown={onKeyDown}
    >
      <IconButton
        label="Map credits"
        icon={Info}
        size="compact"
        expanded={open}
        controls={regionId}
        onClick={toggle}
      />
      <section
        ref={regionRef}
        id={regionId}
        aria-label="Map credits"
        tabIndex={-1}
        hidden={!open}
        data-chrome="attribution-popover"
        data-placement={placement}
        className={styles.popover}
      >
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.text}>
              {entry.href ? (
                <a href={entry.href} rel="noopener" className={styles.link}>
                  {entry.text}
                </a>
              ) : (
                entry.text
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
