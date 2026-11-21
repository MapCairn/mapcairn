// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ClipboardPort } from "@mapcairn/core";
import { Icon, useAnnounce } from "@mapcairn/map";
import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as styles from "./ProductPage.css";
import { COPY_CODE } from "./productContent";

/** How long the button says Copied before it offers to copy again. */
export const COPIED_FEEDBACK_MS = 4000;

/** Where the last copy got to. */
type CopyState = "idle" | "copied" | "failed";

const ICONS = { idle: Copy, copied: Check, failed: X } as const;

/** Props for {@link CopyCodeButton}. */
export interface CopyCodeButtonProps {
  /** The source to copy, exactly as the example shows it. */
  readonly code: string;
  /** What the code is, such as its file name, so each button on a page has its own name. */
  readonly label: string;
  readonly clipboard: ClipboardPort;
}

/**
 * Copies a code example on click. The button's own words show the outcome
 * (Copied, which reverts after {@link COPIED_FEEDBACK_MS}, or Copy failed,
 * which stays until the next try), and the outcome is also announced: politely
 * when it worked, assertively when it did not, with how to copy by hand. Each
 * successful copy gets the full time on Copied, and only the latest click's
 * outcome is shown or announced. Focus stays on the button, which is never
 * disabled. Its visible words come first in its accessible name, which adds
 * what it copies, because a page can hold several.
 */
export function CopyCodeButton({
  code,
  label,
  clipboard,
}: CopyCodeButtonProps) {
  // `attempt` counts outcomes, so each successful copy restarts the reset
  // timer even when the button already says Copied.
  const [{ state, attempt }, setOutcome] = useState<{
    readonly state: CopyState;
    readonly attempt: number;
  }>({ state: "idle", attempt: 0 });
  // The latest click: an older copy that finishes later is ignored.
  const latest = useRef(0);
  const announce = useAnnounce();

  useEffect(() => {
    if (state !== "copied") {
      return;
    }
    // Reset only the copy this timer belongs to.
    const timer = setTimeout(
      () =>
        setOutcome((outcome) =>
          outcome.attempt === attempt ? { ...outcome, state: "idle" } : outcome,
        ),
      COPIED_FEEDBACK_MS,
    );
    return () => clearTimeout(timer);
  }, [state, attempt]);

  async function copy() {
    latest.current += 1;
    const click = latest.current;
    // Called straight from the click, so the browser counts it as the
    // person's own gesture.
    const result = await clipboard.writeText(code);
    if (click !== latest.current) {
      return;
    }
    if (result.ok) {
      setOutcome({ state: "copied", attempt: click });
      announce(COPY_CODE.copiedMessage(label), { keep: true });
    } else {
      setOutcome({ state: "failed", attempt: click });
      announce(COPY_CODE.failedMessage(label), {
        priority: "assertive",
        keep: true,
      });
    }
  }

  return (
    <button
      type="button"
      className={styles.copyButton}
      data-state={state}
      aria-label={`${COPY_CODE[state]}, ${label}`}
      onClick={copy}
    >
      <Icon icon={ICONS[state]} className={styles.copyIcon} />
      {COPY_CODE[state]}
    </button>
  );
}
