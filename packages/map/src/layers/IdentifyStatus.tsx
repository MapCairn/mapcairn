// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { Hourglass } from "lucide-react";
import { useId } from "react";
import { useMessages } from "../services";
import { Icon } from "../ui/Icon";
import { Surface } from "../ui/Surface";
import * as styles from "./IdentifyStatus.css";

/**
 * The line a host shows in the bottom-centre slot while a tap's lookup is
 * taking time ("Looking up what is here"): show it when
 * `useIdentifyFeedback(layers.identifying)` is true.
 *
 * @remarks It is not a live region, on purpose. The lookup's result is said
 *   once when it arrives, and a message after the delay would be coalesced
 *   with it, so a screen reader hears nothing during the wait. It is a
 *   region named by its own words, so the page's content stays inside a
 *   landmark. Escape ends the lookup, and the line with it, so it has no
 *   dismiss button.
 */
export function IdentifyStatus() {
  const { t } = useMessages();
  const textId = useId();
  return (
    <Surface
      as="section"
      variant="floating"
      radius="control"
      className={styles.line}
      aria-labelledby={textId}
      data-testid="identify-status"
    >
      <Icon icon={Hourglass} className={styles.icon} />
      <span id={textId}>{t("layers.identify.lookingUp", {})}</span>
    </Surface>
  );
}
