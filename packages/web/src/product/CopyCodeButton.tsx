// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ClipboardPort } from "@mapcairn/core";
import { Icon, useAnnounce } from "@mapcairn/map";
import { Check, Copy, X } from "lucide-react";
import { useEffect, useState } from "react";
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
  readonly clipboard: ClipboardPort;
}

/**
 * Copies a code example on click. The button's own words show the outcome
 * (Copied, which reverts after {@link COPIED_FEEDBACK_MS}, or Copy failed,
 * which stays until the next try), and the outcome is also announced: politely
 * when it worked, assertively when it did not, with how to copy by hand.
 * Focus stays on the button.
 */
export function CopyCodeButton({ code, clipboard }: CopyCodeButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const announce = useAnnounce();

  useEffect(() => {
    if (state !== "copied") {
      return;
    }
    const timer = setTimeout(() => setState("idle"), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    // Called straight from the click, so the browser counts it as the
    // person's own gesture.
    const result = await clipboard.writeText(code);
    if (result.ok) {
      setState("copied");
      announce(COPY_CODE.copiedMessage, { keep: true });
    } else {
      setState("failed");
      announce(COPY_CODE.failedMessage, { priority: "assertive", keep: true });
    }
  }

  return (
    <button
      type="button"
      className={styles.copyButton}
      data-state={state}
      data-testid="copy-code"
      onClick={copy}
    >
      <Icon icon={ICONS[state]} className={styles.copyIcon} />
      {COPY_CODE[state]}
    </button>
  );
}
