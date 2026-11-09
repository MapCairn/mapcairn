import { announceCopied, formatLatLng, type LatLng } from "@karta/core";
import { Check, Copy, Trash2, TriangleAlert, X } from "lucide-react";
import { type Ref, useEffect, useRef, useState } from "react";
import { useClipboard } from "../../services/hooks";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { useAnnounce } from "../../ui/LiveRegion";
import * as styles from "./PinCard.css";
import { useReverseAddress } from "./useReverseAddress";

/** Props for {@link PinCard}. */
export interface PinCardProps {
  /** Where the pin is. */
  readonly position: LatLng;
  /** Called when the user chooses "Clear pin". */
  readonly onClear: () => void;
  /** When given, a close button is shown that calls it. */
  readonly onClose?: () => void;
  /** The level of the "Dropped pin" heading, so it fits the host's outline. Defaults to 2. */
  readonly headingLevel?: 2 | 3 | 4;
  /**
   * Receives the heading element, which takes focus by script (`tabIndex`
   * -1), so the sheet that opens the card can move focus to it.
   */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

type CopyStatus = "idle" | "copied" | "failed";

/**
 * The content of the pin surface: a heading, the coordinates as selectable
 * text, "Copy coordinates" and "Clear pin" buttons, and the address when the
 * search provider can name the place.
 *
 * The card has no position or surface of its own; the sheet or peek that
 * holds it provides both. Copying shows "Copied" or "Could not copy" inline
 * with an icon, and the announcer says the same, so neither relies on colour
 * or on sight alone. The address stays out of the way while loading and
 * after an error.
 */
export function PinCard({
  position,
  onClear,
  onClose,
  headingLevel = 2,
  headingRef,
}: PinCardProps) {
  const clipboard = useClipboard();
  const announce = useAnnounce();
  const address = useReverseAddress(position);
  const [copy, setCopy] = useState<CopyStatus>("idle");
  const latest = useRef(0);
  const { lat, lng } = position;
  const Heading = `h${headingLevel}` as const;
  const coordinates = formatLatLng(position);

  // A copy that finishes after the pin moved, or the card closed, is stale.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lat and lng are the triggers, not values read in the effect
  useEffect(() => {
    setCopy("idle");
    latest.current += 1;
    return () => {
      latest.current += 1;
    };
  }, [lat, lng]);

  const handleCopy = async () => {
    latest.current += 1;
    const request = latest.current;
    const result = await clipboard.writeText(coordinates);
    if (request !== latest.current) {
      return;
    }
    setCopy(result.ok ? "copied" : "failed");
    announce(announceCopied(result.ok), {
      priority: result.ok ? "polite" : "assertive",
    });
  };

  return (
    <div className={styles.card} data-testid="pin-card">
      <div className={styles.header}>
        <Heading
          ref={headingRef}
          tabIndex={-1}
          className={styles.heading}
          data-testid="pin-card-heading"
        >
          Dropped pin
        </Heading>
        {onClose ? (
          <IconButton
            label="Close pin"
            icon={X}
            size="compact"
            data-testid="pin-card-close"
            onClick={onClose}
          />
        ) : null}
      </div>
      <p className={styles.coordinates} data-testid="pin-coordinates">
        {coordinates}
      </p>
      {address.status === "found" ? (
        <p className={styles.address} data-testid="pin-address">
          {address.text}
        </p>
      ) : null}
      {address.status === "none" ? (
        <p className={styles.address} data-testid="pin-address">
          No address found here.
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          icon={Copy}
          data-testid="pin-copy"
          onClick={handleCopy}
        >
          Copy coordinates
        </Button>
        <Button
          variant="quiet"
          icon={Trash2}
          data-testid="pin-clear"
          onClick={onClear}
        >
          Clear pin
        </Button>
      </div>
      {copy === "copied" ? (
        <p className={styles.feedback} data-testid="pin-copy-feedback">
          <Icon icon={Check} className={styles.feedbackOk} />
          Copied
        </p>
      ) : null}
      {copy === "failed" ? (
        <p className={styles.feedback} data-testid="pin-copy-feedback">
          <Icon icon={TriangleAlert} className={styles.feedbackError} />
          Could not copy
        </p>
      ) : null}
    </div>
  );
}
