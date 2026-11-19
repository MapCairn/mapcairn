// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useLatestRef } from "@mapcairn/react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import {
  type FocusEvent,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useOptionalMessages } from "../../services";
import { Button } from "../Button";
import { Icon, type IconComponent } from "../Icon";
import { IconButton } from "../IconButton";
import { Surface } from "../Surface";
import {
  controls,
  messageText,
  statusIcon,
  statusMessage,
} from "./StatusMessage.css";

/** The shortest time a message that dismisses itself stays on screen. */
export const MIN_AUTO_DISMISS_MS = 6000;

/** The map region, where focus goes when the place it came from is gone. */
const MAP_HOST_SELECTOR = "[data-map-host]";

const icons: Record<StatusMessageVariant, IconComponent> = {
  info: Info,
  success: CircleCheck,
  error: TriangleAlert,
};

/** The kind of message. Errors never dismiss themselves. */
export type StatusMessageVariant = "info" | "success" | "error";

/** Props for {@link StatusMessage}. */
export interface StatusMessageProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    "children" | "onBlur" | "onFocus" | "onMouseEnter" | "onMouseLeave" | "role"
  > {
  /** `info` and `success` are polite status messages; `error` is an alert. */
  readonly variant: StatusMessageVariant;
  /** The message text. Keep it short and specific. */
  readonly children: ReactNode;
  /** Called when the person dismisses the message, and when it times out. */
  readonly onDismiss: () => void;
  /** An optional action, such as "Retry". It does not dismiss the message. */
  readonly action?: { readonly label: string; readonly onClick: () => void };
  /**
   * How long an `info` or `success` message stays before `onDismiss` is
   * called. Values under 6000 are raised to 6000. Ignored for errors.
   * Changing it after mount has no effect; remount with a `key` instead.
   */
  readonly autoDismissMs?: number;
  /** The accessible name of the dismiss button. Defaults to the catalogue's "ui.dismiss". */
  readonly dismissLabel?: string;
}

/**
 * A toast or banner: an icon, text and a dismiss button, so the variant is
 * never conveyed by colour alone. It is the one visible live region besides
 * the hidden announcer: `role="status"` for info and success, `role="alert"`
 * for errors. The role sits on the text only, so a screen reader never reads
 * the Retry and Dismiss buttons as part of the message.
 *
 * When the message goes away while focus is inside it (Dismiss, or an
 * action that ends the condition), focus returns to the element it came from,
 * or to the map region when that element is gone or focus came from the page,
 * so a keyboard person keeps their place. Focus is left alone if it was
 * elsewhere.
 *
 * Errors stay until dismissed. Other messages dismiss themselves after the
 * delay, and the countdown pauses while the pointer is over the message or
 * focus is inside it, then resumes with the time left.
 */
export function StatusMessage({
  variant,
  children,
  onDismiss,
  action,
  autoDismissMs = MIN_AUTO_DISMISS_MS,
  dismissLabel,
  className,
  ...rest
}: StatusMessageProps) {
  const { t } = useOptionalMessages();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [ready, setReady] = useState(false);
  const paused = hovered || focused;
  const dismissRef = useLatestRef(onDismiss);
  const focusInside = useRef(false);
  const cameFrom = useRef<HTMLElement | null>(null);
  const remaining = useRef(Math.max(autoDismissMs, MIN_AUTO_DISMISS_MS));

  // A live region that already holds its text when inserted is often not
  // announced, so the role element mounts empty and is filled after mount.
  useEffect(() => {
    setReady(true);
  }, []);

  useLayoutEffect(
    () => () => {
      if (!focusInside.current) {
        return;
      }
      const target = cameFrom.current?.isConnected
        ? cameFrom.current
        : document.querySelector<HTMLElement>(MAP_HOST_SELECTOR);
      target?.focus();
    },
    [],
  );

  useEffect(() => {
    if (variant === "error" || paused) {
      return;
    }
    const startedAt = Date.now();
    const timer = setTimeout(() => dismissRef.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - startedAt),
      );
    };
  }, [variant, paused, dismissRef]);

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      cameFrom.current =
        event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
    }
    focusInside.current = true;
    setFocused(true);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      focusInside.current = false;
      setFocused(false);
    }
  };

  const classes = statusMessage({ variant });
  return (
    <Surface
      {...rest}
      variant="floating"
      radius="control"
      className={className ? `${classes} ${className}` : classes}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <Icon icon={icons[variant]} className={statusIcon({ variant })} />
      <div
        role={variant === "error" ? "alert" : "status"}
        className={messageText}
      >
        {ready ? children : null}
      </div>
      <div className={controls}>
        {action ? (
          <Button variant="quiet" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null}
        <IconButton
          label={dismissLabel ?? t("ui.dismiss", {})}
          icon={X}
          size="compact"
          onClick={onDismiss}
        />
      </div>
    </Surface>
  );
}
