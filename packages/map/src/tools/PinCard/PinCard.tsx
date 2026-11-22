// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceAddressError,
  announceAddressFound,
  announceAddressNotFound,
  announceCopied,
  formatLatLng,
  type LatLng,
} from "@mapcairn/core";
import {
  Check,
  Copy,
  MapPinArea,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useClipboard, useMessages } from "../../services/hooks";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { Isolate } from "../../ui/Isolate";
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
  /**
   * What the address lookup sends and to whom, shown under the "Look up
   * address" button, which it describes. Defaults to the catalogue's
   * `tools.pin.lookupNote`, which does not name the service because the SDK
   * does not know which one a host uses. A host names its search provider
   * here. Phrasing content only: it sits inside a paragraph.
   */
  readonly lookupNote?: ReactNode;
}

type CopyStatus = "idle" | "copied" | "failed";

/**
 * The content of the pin surface: a heading, the coordinates as selectable
 * text, "Copy coordinates" and "Clear pin" buttons, and an address lookup
 * that the user starts.
 *
 * The lookup sends the pin's position, rounded to about 11 m, to a third
 * party, so nothing is sent until "Look up address" is pressed. While it
 * runs the button is busy; the address, "No address found here." or an error
 * with "Try again" follows, and the announcer says the same. Moving the pin
 * puts the card back to not looked up.
 *
 * The card has no position or surface of its own; the sheet or peek that
 * holds it provides both. Copying shows "Copied" or "Could not copy" inline
 * with an icon, and the announcer says the same, so neither relies on colour
 * or on sight alone.
 */
export function PinCard({
  position,
  onClear,
  onClose,
  headingLevel = 2,
  headingRef,
  lookupNote,
}: PinCardProps) {
  const clipboard = useClipboard();
  const { t } = useMessages();
  const announce = useAnnounce();
  const { state: address, lookUp } = useReverseAddress(position);
  const noteId = useId();
  const addressRef = useRef<HTMLParagraphElement>(null);
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

  const { status: addressStatus } = address;
  const addressText = address.status === "found" ? address.text : "";
  // The lookup button gives way to the address. When focus was on it, focus
  // moves to the address, which a screen reader reads, so only a person whose
  // focus is elsewhere needs the announcement.
  useEffect(() => {
    if (addressStatus === "found" || addressStatus === "none") {
      if (document.activeElement === document.body && addressRef.current) {
        addressRef.current.focus();
      } else {
        announce(
          addressStatus === "found"
            ? announceAddressFound(addressText)
            : announceAddressNotFound(),
          { priority: "polite" },
        );
      }
    } else if (addressStatus === "error") {
      announce(announceAddressError(), { priority: "assertive" });
    }
  }, [addressStatus, addressText, announce]);

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
          {t("tools.pin.heading", {})}
        </Heading>
        {onClose ? (
          <IconButton
            label={t("tools.pin.close", {})}
            icon={X}
            size="compact"
            data-testid="pin-card-close"
            onClick={onClose}
          />
        ) : null}
      </div>
      <p className={styles.coordinates} data-testid="pin-coordinates">
        <Isolate figure>{coordinates}</Isolate>
      </p>
      {address.status === "found" || address.status === "none" ? (
        <p
          ref={addressRef}
          tabIndex={-1}
          className={styles.address}
          data-testid="pin-address"
        >
          {address.status === "found" ? (
            <Isolate>{address.text}</Isolate>
          ) : (
            t("tools.pin.noAddress", {})
          )}
        </p>
      ) : null}
      {address.status === "idle" ||
      address.status === "loading" ||
      address.status === "error" ? (
        <div className={styles.lookup}>
          <Button
            variant="secondary"
            icon={MapPinArea}
            busy={address.status === "loading"}
            aria-describedby={noteId}
            data-testid={
              address.status === "error" ? "pin-lookup-retry" : "pin-lookup"
            }
            onClick={lookUp}
          >
            {address.status === "error"
              ? t("tools.tryAgain", {})
              : t("tools.pin.lookUp", {})}
          </Button>
          {address.status === "loading" ? (
            <p className={styles.address} data-testid="pin-address-loading">
              {t("tools.pin.lookingUp", {})}
            </p>
          ) : null}
          {address.status === "error" ? (
            <p className={styles.feedback} data-testid="pin-address-error">
              <Icon icon={Warning} className={styles.feedbackError} />
              {t("tools.pin.lookupFailed", {})}
            </p>
          ) : null}
          <p className={styles.note} id={noteId} data-testid="pin-lookup-note">
            {lookupNote ?? t("tools.pin.lookupNote", {})}
          </p>
        </div>
      ) : null}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          icon={Copy}
          data-testid="pin-copy"
          onClick={handleCopy}
        >
          {t("tools.pin.copy", {})}
        </Button>
        <Button
          variant="quiet"
          icon={Trash}
          data-testid="pin-clear"
          onClick={onClear}
        >
          {t("tools.pin.clear", {})}
        </Button>
      </div>
      {copy === "copied" ? (
        <p className={styles.feedback} data-testid="pin-copy-feedback">
          <Icon icon={Check} className={styles.feedbackOk} />
          {t("tools.pin.copied", {})}
        </p>
      ) : null}
      {copy === "failed" ? (
        <p className={styles.feedback} data-testid="pin-copy-feedback">
          <Icon icon={Warning} className={styles.feedbackError} />
          {t("tools.pin.copyFailed", {})}
        </p>
      ) : null}
    </div>
  );
}
