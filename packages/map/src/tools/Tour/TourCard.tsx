import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useFocusElement, useFocusReturn } from "../../chrome/focusRegistry";
import { usePreferences } from "../../services";
import { Button } from "../../ui/Button";
import { useAnnounce } from "../../ui/LiveRegion";
import { Surface } from "../../ui/Surface";
import * as styles from "./TourCard.css";
import type { UseTour } from "./useTour";

/** The words of a card that is not a step. */
export interface TourCardCopy {
  readonly heading: string;
  readonly text: string;
}

/** Props for {@link TourCard}. */
export interface TourCardProps {
  readonly tour: UseTour;
  /** The welcome card, offered on a first visit. */
  readonly welcome: TourCardCopy & {
    /** Read out once when the welcome card appears, which takes no focus. */
    readonly announcement: string;
  };
  /** The ending, after the last step. */
  readonly ending: TourCardCopy;
}

/**
 * The first-visit tour's card: the welcome card, a step, or the ending. It is
 * a region named by its heading, not a dialog, because nothing is modal.
 *
 * @remarks The welcome card never takes focus. Taking the tour, Next and a
 *   restart from Help move focus to the heading; a step finished by doing it
 *   leaves focus with the person. Escape inside the card skips (or closes the
 *   ending) and prevents the default, so the app's own Escape does not also
 *   close a surface. When the card closes with focus inside it, focus goes to
 *   the map. While a step is current, its control carries
 *   `data-tour-highlight` and is scrolled into view.
 */
export function TourCard({ tour, welcome, ending }: TourCardProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const handledFocus = useRef(0);
  const [announced, setAnnounced] = useState(false);
  const restoreFocus = useFocusReturn();
  const elementFor = useFocusElement();
  const announce = useAnnounce();
  const { reducedMotion } = usePreferences();
  const { state, step, steps, focusRequest } = tour;

  useEffect(() => {
    if (state.status === "welcome" && !announced) {
      setAnnounced(true);
      announce(welcome.announcement);
    }
  }, [state.status, announced, announce, welcome.announcement]);

  useEffect(() => {
    if (focusRequest > handledFocus.current) {
      handledFocus.current = focusRequest;
      headingRef.current?.focus();
    }
  });

  const target = step?.target;
  useEffect(() => {
    const element = target ? elementFor(target) : null;
    if (!element) {
      return;
    }
    element.setAttribute("data-tour-highlight", "true");
    element.scrollIntoView({
      block: "nearest",
      behavior: reducedMotion ? "auto" : "smooth",
    });
    return () => {
      element.removeAttribute("data-tour-highlight");
    };
  }, [target, elementFor, reducedMotion]);

  if (state.status === "off") {
    return null;
  }

  const leave = (action: () => void) => {
    const card = headingRef.current?.parentElement;
    const hadFocus = card?.contains(card.ownerDocument.activeElement) ?? false;
    action();
    if (hadFocus) {
      restoreFocus(null);
    }
  };
  const dismiss = () =>
    leave(state.status === "ended" ? tour.close : tour.skip);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      dismiss();
    }
  };

  let heading = ending.heading;
  let text = ending.text;
  if (state.status === "welcome") {
    heading = welcome.heading;
    text = welcome.text;
  } else if (step) {
    heading = step.heading;
    text = step.text;
  }
  const last = state.status === "running" && state.step === steps.length - 1;

  return (
    <Surface
      as="section"
      radius="control"
      aria-labelledby={headingId}
      data-testid="tour-card"
      className={styles.card}
      onKeyDown={onKeyDown}
    >
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className={styles.heading}
      >
        {heading}
      </h2>
      {state.status === "running" ? (
        <p className={styles.progress}>
          Step {state.step + 1} of {steps.length}
        </p>
      ) : null}
      <p className={styles.text}>{text}</p>
      <div className={styles.actions}>
        {state.status === "welcome" ? (
          <>
            <Button onClick={tour.start}>Take the tour</Button>
            <Button variant="secondary" onClick={dismiss}>
              Skip
            </Button>
          </>
        ) : null}
        {state.status === "running" ? (
          <>
            <Button onClick={tour.next}>{last ? "Finish" : "Next"}</Button>
            <Button variant="quiet" onClick={dismiss}>
              Skip tour
            </Button>
          </>
        ) : null}
        {state.status === "ended" ? (
          <Button onClick={dismiss}>Close</Button>
        ) : null}
      </div>
    </Surface>
  );
}
