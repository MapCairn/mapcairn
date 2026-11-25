// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { Icon } from "@mapcairn/map";
import { Check, Copy, X } from "@phosphor-icons/react";
import * as styles from "./ProductPage.css";
import { COPY_CODE } from "./productContent";

/**
 * A small icon button that copies a code example from the corner of its code.
 * It renders `hidden` and does nothing by itself: the page ships no framework
 * script, so `COPY_CODE_SCRIPT` (`app/copyCodeScript.ts`) shows it and wires
 * it up once the page runs, and a visitor without script never sees a button
 * that cannot work. It must sit inside a `data-copy-scope` that holds the code
 * to copy as a `data-copy` element (see {@link copyMessages}).
 *
 * Its three icons are all in the markup and CSS shows the one for the
 * button's `data-state`: the copy icon, a check once copied (the script puts
 * it back after a few seconds), or a cross if the copy failed. The script
 * names the button in words for each state and announces the outcome.
 */
export function CopyCodeButton() {
  return (
    <button
      type="button"
      className={styles.copyButton}
      data-copy-button=""
      data-state="idle"
      aria-label={COPY_CODE.idle}
      hidden
    >
      <Icon icon={Copy} className={styles.copyIconIdle} />
      <Icon icon={Check} className={styles.copyIconCopied} />
      <Icon icon={X} className={styles.copyIconFailed} />
    </button>
  );
}
