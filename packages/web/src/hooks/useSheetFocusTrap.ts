import { type RefObject, useEffect } from "react";

/** Traps Tab navigation inside a full-height mobile sheet while it is modal. */
export function useSheetFocusTrap(
  active: boolean,
  panelRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(selector),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", handleKeyDown);
    return () => panel.removeEventListener("keydown", handleKeyDown);
  }, [active, panelRef]);
}
