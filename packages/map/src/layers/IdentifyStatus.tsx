// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useMessages } from "../services";
import { StatusMessage } from "../ui/StatusMessage";
import { IDENTIFY_TIMEOUT_MS } from "./identifyRun";

/**
 * Longer than a lookup can run, so the line's own countdown never ends one:
 * the lookup times out first. `StatusMessage` dismisses an info message by
 * itself after this long.
 */
const NEVER_BEFORE_TIMEOUT_MS = IDENTIFY_TIMEOUT_MS + 1_000;

/** Props for {@link IdentifyStatus}. */
export interface IdentifyStatusProps {
  /** Ends the lookup, as Escape does. Called from the line's dismiss button. */
  readonly onCancel: () => void;
}

/**
 * The line a host shows in the bottom-centre slot while a tap's lookup is
 * taking time ("Looking up what is here"): show it when
 * `useIdentifyFeedback(layers.identifying)` is true, and pass
 * `layers.cancelIdentify` as `onCancel`.
 *
 * @remarks It is a `StatusMessage`, so it says itself once, politely, when it
 *   appears at the delay, and the page's content stays inside a live region.
 *   The lookup's result is said separately when it arrives, through the
 *   announcer with `keep`, so the two never replace each other. Dismissing the
 *   line ends the lookup, the same as Escape.
 */
export function IdentifyStatus({ onCancel }: IdentifyStatusProps) {
  const { t } = useMessages();
  return (
    <StatusMessage
      variant="info"
      data-testid="identify-status"
      autoDismissMs={NEVER_BEFORE_TIMEOUT_MS}
      onDismiss={onCancel}
    >
      {t("layers.identify.lookingUp", {})}
    </StatusMessage>
  );
}
